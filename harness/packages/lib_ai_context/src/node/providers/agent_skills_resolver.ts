import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { WorkspaceFolder } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { collection, createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, NullLogger, withPrefix } from '@gitlab-org/logging';
import {
  FileAccessService,
  FileNotFoundError,
  fsPathToUri,
  getRelativePath,
  isFileSchemeUri,
  parseURIString,
} from '@gitlab-org/fs';
import { BareService, createFallbackService } from '@gitlab-org/core';
import { RepositoryDiscoveryService, StatelessRepository } from '@gitlab-org/repositories';
import { ConfigService } from '@gitlab-org/config';
import { getTrustedReadableDirectories, isContainedIn } from '@gitlab-org/ai-configuration';
import { UserRuleContextItem } from './rule';

type ResolvedSkillFile = {
  name: string;
  description: string;
  displayPath: string;
  location: string;
  slashCommand: boolean;
  source: 'workspace' | 'global';
};

type SkillFileInfo = {
  absolutePath: string;
  workspaceRelativePath: string;
  skillDir: string;
  source: 'workspace' | 'global';
  // When set, the file is re-resolved at read time and its canonical target must stay
  // within one of these directories. Carried for global skills (trusted-dir scoped).
  trustedRoots?: string[];
};

export type AgentSkillSlashCommand = {
  name: string;
  description: string;
  skillName: string;
};

export type AgentSkill = {
  name: string;
  description: string;
};

export type SkillLoadWarning = {
  path: string;
  reason: string;
};

export type AgentSkillSlashCommandsResult = {
  commands: AgentSkillSlashCommand[];
  warnings: SkillLoadWarning[];
};

export interface AgentSkillsResolver {
  resolveAgentSkillsContextItem(): Promise<UserRuleContextItem>;
  getSkillSlashCommands(): Promise<AgentSkillSlashCommandsResult>;
  getSkills(): Promise<AgentSkill[]>;
}

export const AgentSkillsResolver = createInterfaceId<AgentSkillsResolver>('AgentSkillsResolver');

const SKILL_GLOB = [
  '.agents/skills/*/SKILL.md',
  '**/.agents/skills/*/SKILL.md',
  'skills/*/SKILL.md',
  '**/skills/*/SKILL.md',
];
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function makeGlobalDisplayPath(absolutePath: string): string {
  try {
    const home = homedir();
    if (
      absolutePath.startsWith(home) &&
      (absolutePath.length === home.length || absolutePath[home.length] === '/')
    ) {
      return `~${absolutePath.slice(home.length)}`;
    }
  } catch {
    // Fall through to absolute path
  }
  return absolutePath;
}

const SkillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  metadata: z
    .object({
      'slash-command': z
        .union([z.boolean(), z.string().transform((val) => val === 'enabled' || val === 'true')])
        .optional(),
    })
    .optional(),
});

type ParsedSkillFrontmatter = {
  name: string;
  description: string;
  body: string;
  slashCommand: boolean;
};

type FrontmatterParseResult =
  | { ok: true; value: ParsedSkillFrontmatter }
  | { ok: false; reason: string };

function describeInvalidFrontmatter(parsed: unknown, error: z.ZodError): string {
  const obj =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const missing = ['name', 'description'].filter((field) => obj[field] === undefined);
  if (missing.length > 0) {
    return `is missing required frontmatter field(s): ${missing.join(', ')}`;
  }

  const issue = error.issues[0];
  const field = issue.path.length > 0 ? issue.path.join('.') : 'frontmatter';
  return `has an invalid "${field}" field — it must be text (quote values that contain ":" or other special characters)`;
}

@Injectable(AgentSkillsResolver, [
  Logger,
  RepositoryDiscoveryService,
  collection(FileAccessService),
  ConfigService,
])
export class DefaultAgentSkillsResolver implements AgentSkillsResolver {
  #logger: Logger;

  #repositoryDiscoveryService: RepositoryDiscoveryService;

  #fileAccessService: BareService<FileAccessService>;

  #configService: ConfigService;

  constructor(
    logger: Logger,
    repositoryDiscoveryService: RepositoryDiscoveryService,
    fileAccessServices: FileAccessService[],
    configService: ConfigService,
  ) {
    this.#logger = withPrefix(logger, '[AgentSkillsResolver]');
    this.#repositoryDiscoveryService = repositoryDiscoveryService;
    this.#fileAccessService = createFallbackService(new NullLogger(), fileAccessServices);
    this.#configService = configService;
  }

  async resolveAgentSkillsContextItem(): Promise<UserRuleContextItem> {
    // Share a per-call repo cache so that getRepositoriesForWorkspace is invoked
    // at most once per workspace folder, even when both skill discovery and the
    // searched-locations builder need the same result.
    const repoCache = new Map<string, StatelessRepository[]>();
    const { skills } = await this.#resolveAllSkills(repoCache);

    if (skills.length === 0) {
      return this.#formatEmptyContextItem(await this.#getSearchedLocations(repoCache));
    }

    return this.#formatSkillsContextItem(skills);
  }

  async getSkillSlashCommands(): Promise<AgentSkillSlashCommandsResult> {
    const { skills, warnings } = await this.#resolveAllSkills();

    const commands = skills
      .filter((skill) => skill.slashCommand)
      .map((skill) => ({
        name: `/${skill.name}`,
        description: skill.description,
        skillName: skill.name,
      }));

    return { commands, warnings };
  }

  async getSkills(): Promise<AgentSkill[]> {
    const { skills } = await this.#resolveAllSkills();

    return skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
  }

  async #resolveAllSkills(
    repoCache?: Map<string, StatelessRepository[]>,
  ): Promise<{ skills: ResolvedSkillFile[]; warnings: SkillLoadWarning[] }> {
    // Warnings are collected into a per-call array and returned with the result so
    // each caller observes exactly the warnings of the resolve it awaited; nothing
    // is shared across concurrent resolves.
    const warnings: SkillLoadWarning[] = [];

    const config = this.#configService.get();
    const workspaceFolders = config.workspaceFolders || [];

    const allSkillFiles = await this.#findAllSkillFiles(workspaceFolders, repoCache);

    const uniqueSkills = new Map<string, ResolvedSkillFile>();
    if (allSkillFiles.length > 0) {
      const allSkills = await this.#resolveSkillFiles(allSkillFiles, warnings);

      // Deduplicate by name: workspace skills take precedence over global skills.
      // Workspace results come first in allSkillFiles, so first-seen wins for
      // same-source duplicates. We explicitly prefer workspace over global.
      for (const skill of allSkills) {
        const existing = uniqueSkills.get(skill.name);
        if (!existing) {
          uniqueSkills.set(skill.name, skill);
        } else if (skill.source === 'workspace' && existing.source === 'global') {
          this.#logger.info(
            `Workspace skill "${skill.name}" overrides global skill with the same name`,
          );
          uniqueSkills.set(skill.name, skill);
        } else {
          this.#logger.debug(
            `Skipping duplicate skill "${skill.name}" from "${skill.displayPath}"`,
          );
        }
      }
    }

    return { skills: [...uniqueSkills.values()], warnings };
  }

  async #resolveSkillFiles(
    skillFiles: SkillFileInfo[],
    warnings: SkillLoadWarning[],
  ): Promise<ResolvedSkillFile[]> {
    const results = await Promise.all(
      skillFiles.map((fileInfo) => this.#tryReadSkillFile(fileInfo, warnings)),
    );
    return results.filter((skill): skill is ResolvedSkillFile => skill !== null);
  }

  async #tryReadSkillFile(
    fileInfo: SkillFileInfo,
    warnings: SkillLoadWarning[],
  ): Promise<ResolvedSkillFile | null> {
    try {
      // Re-resolve the SKILL.md right before reading and re-check containment. This closes
      // the TOCTOU window between the earlier directory-symlink check and the read, and
      // rejects nested symlinks where the file (or its directory) ultimately resolves
      // outside trusted dirs (e.g. SKILL.md -> trusted-dir/x -> /etc). realPath collapses
      // the full symlink chain, and we read the canonical path rather than re-traversing it.
      let readPath = fileInfo.absolutePath;
      if (fileInfo.trustedRoots) {
        const realPath = await this.#fileAccessService.realPath(fileInfo.absolutePath);
        if (!realPath || !isContainedIn(fileInfo.trustedRoots, realPath)) {
          this.#logger.warn(
            `Skipping skill "${fileInfo.absolutePath}": resolves to "${realPath}" outside trusted directories`,
          );
          return null;
        }
        readPath = realPath;
      }

      const rawContent = await this.#fileAccessService.getText(readPath);
      const parsed = DefaultAgentSkillsResolver.parseFrontmatterResult(rawContent);

      if (!parsed.ok) {
        this.#logger.warn(`SKILL.md at "${fileInfo.absolutePath}" ${parsed.reason}, skipping`);
        warnings.push({ path: fileInfo.absolutePath, reason: parsed.reason });
        return null;
      }

      this.#logger.info(`SKILL.md loaded from "${fileInfo.absolutePath}"`);

      return {
        name: parsed.value.name,
        description: parsed.value.description,
        displayPath: fileInfo.workspaceRelativePath,
        // Absolute so read_file can resolve it regardless of the active workspace folder; file:// URIs are rejected.
        location: fileInfo.absolutePath,
        slashCommand: parsed.value.slashCommand,
        source: fileInfo.source,
      };
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        this.#logger.debug(`SKILL.md file not found at "${fileInfo.absolutePath}".`);
      } else {
        this.#logger.warn(`Could not read SKILL.md from "${fileInfo.absolutePath}"`, error);
      }
      return null;
    }
  }

  static parseFrontmatterResult(raw: string): FrontmatterParseResult {
    // Strip a leading BOM and normalize CRLF/CR so frontmatter authored on Windows
    // (or with a UTF-8 BOM) isn't misreported as missing — FRONTMATTER_REGEX only
    // matches \n delimiters.
    const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const match = FRONTMATTER_REGEX.exec(normalized);
    if (!match) {
      return {
        ok: false,
        reason: 'is missing YAML frontmatter (no "---" delimited block at the top of the file)',
      };
    }

    const body = match[2].trim();

    let parsed: unknown;
    try {
      parsed = parseYaml(match[1]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: `has invalid YAML frontmatter: ${detail}` };
    }

    const result = SkillFrontmatterSchema.safeParse(parsed);
    if (!result.success) {
      return { ok: false, reason: describeInvalidFrontmatter(parsed, result.error) };
    }

    return {
      ok: true,
      value: {
        name: result.data.name,
        description: result.data.description,
        body,
        slashCommand: result.data.metadata?.['slash-command'] === true,
      },
    };
  }

  #formatEmptyContextItem(locations: string[]): UserRuleContextItem {
    const content =
      locations.length > 0
        ? `No agent skills were discovered. Searched the following locations:\n${locations.map((loc) => `  ${loc}`).join('\n')}`
        : 'No agent skills were discovered (no skill locations were configured).';

    return {
      category: 'user_rule',
      content,
      id: 'agent-skills-instructions',
      metadata: {
        title: 'Agent Skills',
        enabled: true,
        subType: 'user_rule',
        icon: 'document',
        secondaryText: '',
        subTypeLabel: 'No agent skills found',
      },
    } satisfies UserRuleContextItem;
  }

  #formatSkillsContextItem(skills: ResolvedSkillFile[]): UserRuleContextItem {
    const skillEntries = skills
      .map(
        (skill) =>
          `  <skill>\n    <name>${skill.name}</name>\n    <description>${skill.description}</description>\n    <location>${skill.location}</location>\n  </skill>`,
      )
      .join('\n');

    const content = `The following agent skills are available in this workspace. Load the skill file when a task matches one of the available skills listed below:\n\n<available_skills>\n${skillEntries}\n</available_skills>`;

    return {
      category: 'user_rule',
      content,
      id: 'agent-skills-instructions',
      metadata: {
        title: 'Agent Skills',
        enabled: true,
        subType: 'user_rule',
        icon: 'document',
        secondaryText: skills.map((s) => s.name).join(', '),
        subTypeLabel: `${skills.length} agent ${skills.length === 1 ? 'skill' : 'skills'} included`,
      },
    } satisfies UserRuleContextItem;
  }

  #getGlobalSkillDirectories(): string[] {
    return getTrustedReadableDirectories().map((dir) => join(dir, 'skills'));
  }

  #isGlobalSkillsEnabled(): boolean {
    return this.#configService.get().enableGlobalSkills === true;
  }

  async #getSearchedLocations(repoCache?: Map<string, StatelessRepository[]>): Promise<string[]> {
    const config = this.#configService.get();
    const workspaceFolders = config.workspaceFolders || [];

    // Workspace locations: per-repo, per-glob-pattern (strip /SKILL.md suffix)
    const fileSchemeWorkspaceFolders = workspaceFolders.filter((wsf) => isFileSchemeUri(wsf.uri));
    const workspaceLocationSets = await Promise.all(
      fileSchemeWorkspaceFolders.map((wsf) => this.#getWorkspaceSearchedLocations(wsf, repoCache)),
    );
    const locations = new Set<string>(workspaceLocationSets.flat());

    // Global locations: one entry per global skill directory
    if (this.#isGlobalSkillsEnabled()) {
      for (const dir of this.#getGlobalSkillDirectories()) {
        locations.add(`${makeGlobalDisplayPath(dir)}/*/`);
      }
    }

    return [...locations];
  }

  async #getWorkspaceSearchedLocations(
    wsf: WorkspaceFolder,
    repoCache?: Map<string, StatelessRepository[]>,
  ): Promise<string[]> {
    const workspaceUri = parseURIString(wsf.uri);
    const reposInWorkspace = await this.#getReposForWorkspace(workspaceUri.fsPath, repoCache);
    return reposInWorkspace.flatMap((repo) =>
      SKILL_GLOB.map((glob) => {
        // Strip the trailing /SKILL.md to get the skill directory glob pattern
        const dirGlob = glob.replace(/\/SKILL\.md$/, '');
        const repoUri = fsPathToUri(join(repo.fsPath, dirGlob));
        // Append '/' to make it clear this is a directory glob pattern
        return `${getRelativePath(workspaceUri, repoUri)}/`;
      }),
    );
  }

  async #getReposForWorkspace(
    workspaceFsPath: string,
    repoCache?: Map<string, StatelessRepository[]>,
  ): Promise<StatelessRepository[]> {
    if (repoCache) {
      const cached = repoCache.get(workspaceFsPath);
      if (cached) {
        return cached;
      }
    }
    const repos =
      await this.#repositoryDiscoveryService.getRepositoriesForWorkspace(workspaceFsPath);
    repoCache?.set(workspaceFsPath, repos);
    return repos;
  }

  async #findGlobalSkillFiles(): Promise<SkillFileInfo[]> {
    const trustedDirs = getTrustedReadableDirectories().map((dir) => resolve(dir));
    // canonical form lets containment succeed when a trusted dir itself is a symlink (common dotfile pattern).
    const canonicalTrustedDirs = await Promise.all(
      trustedDirs.map(async (dir) => (await this.#fileAccessService.realPath(dir)) || dir),
    );
    const globalDirs = trustedDirs.map((dir) => join(dir, 'skills'));

    const perDirResults = await Promise.all(
      globalDirs.map((baseDir) => this.#findSkillsInGlobalDir(baseDir, canonicalTrustedDirs)),
    );

    return perDirResults.flat();
  }

  async #findSkillsInGlobalDir(
    baseDir: string,
    canonicalTrustedDirs: string[],
  ): Promise<SkillFileInfo[]> {
    try {
      const entries = await readdir(baseDir, { withFileTypes: true });
      const skillDirNames = (
        await Promise.all(
          entries.map(async (entry) => {
            if (entry.isDirectory()) return entry.name;
            if (!entry.isSymbolicLink()) return undefined;
            const linkPath = join(baseDir, entry.name);
            try {
              const target = await stat(linkPath);
              if (!target.isDirectory()) return undefined;
              // Bound the canonical target to a trusted directory so a symlink like
              // skills/evil -> /etc can't leak /etc/SKILL.md into the AI context.
              const realPath = await this.#fileAccessService.realPath(linkPath);
              if (!realPath || !isContainedIn(canonicalTrustedDirs, realPath)) {
                this.#logger.warn(
                  `Skipping skill symlink "${linkPath}": target "${realPath}" is outside trusted directories`,
                );
                return undefined;
              }
              return entry.name;
            } catch (err: unknown) {
              this.#logger.debug(`Could not read link: "${linkPath}"`, err);
              return undefined; // dangling symlink (e.g. clone removed)
            }
          }),
        )
      ).filter((name): name is string => name !== undefined);

      return skillDirNames.map((name) => {
        const skillDirPath = join(baseDir, name);
        const skillFilePath = join(skillDirPath, 'SKILL.md');
        return {
          absolutePath: skillFilePath,
          workspaceRelativePath: makeGlobalDisplayPath(skillFilePath),
          skillDir: skillDirPath,
          source: 'global',
          trustedRoots: canonicalTrustedDirs,
        };
      });
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        this.#logger.debug(`Global skills directory not found: "${baseDir}"`);
      } else {
        this.#logger.warn(`Could not read global skills directory: "${baseDir}"`, error);
      }
      return [];
    }
  }

  async #findAllSkillFiles(
    workspaceFolders: WorkspaceFolder[],
    repoCache?: Map<string, StatelessRepository[]>,
  ): Promise<SkillFileInfo[]> {
    const [workspaceResults, globalResults] = await Promise.all([
      Promise.all(workspaceFolders.map((wsf) => this.#findSkillsInWorkspace(wsf, repoCache))),
      this.#isGlobalSkillsEnabled() ? this.#findGlobalSkillFiles() : Promise.resolve([]),
    ]);

    return [...workspaceResults.flat(), ...globalResults];
  }

  async #findSkillsInWorkspace(
    wsf: WorkspaceFolder,
    repoCache?: Map<string, StatelessRepository[]>,
  ): Promise<SkillFileInfo[]> {
    if (!isFileSchemeUri(wsf.uri)) {
      this.#logger.debug(`Skipping skill discovery for virtual workspace: ${wsf.uri}`);
      return [];
    }

    const workspaceUri = parseURIString(wsf.uri);
    const reposInWorkspace = await this.#getReposForWorkspace(workspaceUri.fsPath, repoCache);

    const repoResults = await Promise.all(
      reposInWorkspace.map((repo) => this.#findSkillsInRepo(repo, workspaceUri)),
    );

    return repoResults.flat();
  }

  async #findSkillsInRepo(repo: StatelessRepository, workspaceUri: URI): Promise<SkillFileInfo[]> {
    const files = await repo.getFiles(SKILL_GLOB);
    const gitSkillFiles = files.map((filePath) => {
      const absolutePath = join(repo.fsPath, filePath);
      const fileUri = fsPathToUri(absolutePath);
      const workspaceRelativePath = getRelativePath(workspaceUri, fileUri);
      const skillDir = join(repo.fsPath, filePath, '..');
      return {
        absolutePath,
        workspaceRelativePath,
        skillDir,
        source: 'workspace' as const,
      };
    });

    const symlinkSkillFiles = await this.#findSymlinkedSkillsInRepo(repo, workspaceUri, files);

    // Dedupe by absolutePath: a real skill found via git and a symlink scan of the
    // same base dir never collide (git treats symlinks as opaque file entries), but
    // dedupe protects against overlap when both passes surface the same path.
    const byPath = new Map<string, SkillFileInfo>();
    for (const skillFile of [...gitSkillFiles, ...symlinkSkillFiles]) {
      if (!byPath.has(skillFile.absolutePath)) {
        byPath.set(skillFile.absolutePath, skillFile);
      }
    }
    return [...byPath.values()];
  }

  // `repo.getFiles` is backed by `git ls-files`, which treats a directory symlink as a
  // single opaque entry and never descends into it. Skills installed as symlinks (e.g.
  // user-scope plugins linked into `.agents/skills`) are therefore invisible to git.
  // Scan the skill base directories on disk and resolve symlinked subdirectories so
  // those skills are discovered too.
  async #findSymlinkedSkillsInRepo(
    repo: StatelessRepository,
    workspaceUri: URI,
    gitSkillFiles: string[],
  ): Promise<SkillFileInfo[]> {
    // Conventional repo-root bases cover the common case (including a repo with ONLY
    // symlinked skills); bases derived from git-discovered SKILL.md paths cover nested
    // monorepo layouts where a symlink sits beside a real skill.
    const baseDirs = new Set<string>([
      join(repo.fsPath, '.agents', 'skills'),
      join(repo.fsPath, 'skills'),
    ]);
    for (const filePath of gitSkillFiles) {
      baseDirs.add(dirname(dirname(join(repo.fsPath, filePath))));
    }

    const perBaseResults = await Promise.all(
      [...baseDirs].map((baseDir) => this.#findSymlinkedSkillsInDir(baseDir, workspaceUri)),
    );
    return perBaseResults.flat();
  }

  async #findSymlinkedSkillsInDir(baseDir: string, workspaceUri: URI): Promise<SkillFileInfo[]> {
    let entries;
    try {
      entries = await readdir(baseDir, { withFileTypes: true });
    } catch (error: unknown) {
      this.#logFsDiscoveryError(`skill base directory "${baseDir}"`, error);
      return [];
    }

    // `readdir(..., { withFileTypes: true })` reports a symlinked directory as
    // `isDirectory() === false` / `isSymbolicLink() === true`. Real directories are
    // already covered by git, so only resolve symlinks here.
    const symlinkNames = (
      await Promise.all(
        entries.map(async (entry) => {
          if (!entry.isSymbolicLink()) return undefined;
          try {
            const target = await stat(join(baseDir, entry.name));
            return target.isDirectory() ? entry.name : undefined;
          } catch (statError: unknown) {
            this.#logFsDiscoveryError(`symlink target "${join(baseDir, entry.name)}"`, statError);
            return undefined;
          }
        }),
      )
    ).filter((name): name is string => name !== undefined);

    return symlinkNames.map((name) => {
      const skillDir = join(baseDir, name);
      const absolutePath = join(skillDir, 'SKILL.md');
      return {
        absolutePath,
        workspaceRelativePath: getRelativePath(workspaceUri, fsPathToUri(absolutePath)),
        skillDir,
        source: 'workspace' as const,
      };
    });
  }

  // Best-effort skill discovery touches paths that may legitimately be absent (a
  // missing base directory, a dangling symlink). A missing path (ENOENT) is
  // expected and logged at debug; any other failure (e.g. EACCES) silently hides
  // a skill, so it is surfaced at warn. Centralized so every filesystem call site
  // classifies errors identically and the handlers cannot drift apart.
  #logFsDiscoveryError(subject: string, error: unknown): void {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      this.#logger.debug(`Skipping missing ${subject} during skill discovery`);
    } else {
      this.#logger.warn(`Could not read ${subject} during skill discovery`, error);
    }
  }
}
