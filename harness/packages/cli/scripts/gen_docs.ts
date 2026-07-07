#!/usr/bin/env bun
/**
 * Auto-generates `packages/cli/docs/cli-reference.md` from the {@link DuoCommand}
 * tree rooted at {@link RootCommand}.
 *
 * Run:
 *   bun packages/cli/scripts/gen_docs.ts
 *   bun packages/cli/scripts/gen_docs.ts --check   # CI: fail if drift
 *
 * The same {@link RootCommand} instance powers runtime command registration
 * (`packages/cli/src/index.tsx`) and these docs — so command metadata cannot
 * drift between the two.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import prettier from 'prettier';

import type { OptionDef, OptionDefMap } from '../src/option_def';
import type { DuoCommand, Example } from '../src/commands/duo_command';
import { RootCommand } from '../src/commands/root_command';
import { ExitHandler } from '../src/utils/exit';

function escapeMd(s: string): string {
  // Pipes break Markdown table cells; backticks need to survive in description text.
  let out = s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
  // Wrap bare URLs in autolink brackets (MD034) — but skip URLs already inside
  // backticks or angle brackets.
  out = out.replace(/(^|[^`<\w])(https?:\/\/[^\s`<>)\]]+)/g, '$1<$2>');
  return out;
}

function fmtDefault(d: unknown): string {
  if (d === undefined) return '';
  if (d === '') return '`""`';
  if (typeof d === 'string') {
    if (d === process.cwd()) return '_current working directory_';
    return `\`${d}\``;
  }
  if (typeof d === 'boolean' || typeof d === 'number') return `\`${String(d)}\``;
  try {
    return `\`${JSON.stringify(d)}\``;
  } catch {
    return '';
  }
}

function renderOptionsTable(group: OptionDefMap | OptionDef[]): string {
  const defs: OptionDef[] = Array.isArray(group) ? group : Object.values(group);
  const visible = defs.filter((d) => !d.hidden && !d.mandatory);
  if (visible.length === 0) return '_(no public options)_\n';

  const header =
    '| Flag | Environment variable | Default | Values | Description |\n' +
    '| --- | --- | --- | --- | --- |';
  const rows = visible.map((d) => {
    const flag = `\`${d.flags}\``;
    const env = d.env ? `\`${d.env}\`` : '';
    const def = fmtDefault(d.default);
    const choices = d.choices ? d.choices.map((c) => `\`${c}\``).join(', ') : '';
    return `| ${flag} | ${env} | ${def} | ${choices} | ${escapeMd(d.description)} |`;
  });
  return [header, ...rows].join('\n') + '\n';
}

function renderRequiredOptionsTable(group: OptionDefMap | OptionDef[]): string {
  const defs: OptionDef[] = Array.isArray(group) ? group : Object.values(group);
  const required = defs.filter((d) => !d.hidden && d.mandatory);
  if (required.length === 0) return '';

  const header = '| Flag | Environment variable | Description |\n' + '| --- | --- | --- |';
  const rows = required.map((d) => {
    const flag = `\`${d.flags}\``;
    const env = d.env ? `\`${d.env}\`` : '';
    return `| ${flag} | ${env} | ${escapeMd(d.description)} |`;
  });
  return [header, ...rows].join('\n') + '\n';
}

/** Builds the full display name for a command, e.g. "`duo run`" or "`duo` (TUI)". */
function buildDisplayName(parentPath: string, name: string): string {
  // The TUI pseudo-entry has no Commander name — it's the default action on the parent.
  if (name.startsWith('(')) return `\`${parentPath}\` ${name}`;
  return `\`${parentPath} ${name}\``;
}

/** Derives the bare shell invocation from the full display name for auto-generated examples. */
function bareInvocation(displayName: string): string {
  return displayName
    .replace(/`/g, '')
    .replace(/\s*\(.*?\)\s*$/, '') // strip "(TUI)" suffix
    .replace(/\s*\[.*?\]\s*$/, '') // strip "[args...]" suffix
    .trim();
}

function renderExamples(examples: Example[], displayName: string): string {
  // Empty array = short command: use the bare invocation as the sole example.
  if (examples.length === 0) {
    return '```console\n' + bareInvocation(displayName) + '\n```\n';
  }

  const lines = examples.flatMap(({ title, exampleCommand }, i) => {
    const block = [`# ${title}`, exampleCommand];
    return i < examples.length - 1 ? [...block, ''] : block;
  });
  return '```console\n' + lines.join('\n') + '\n```\n';
}

function renderCommand(cmd: DuoCommand, depth = 2, parentPath = ''): string {
  if (cmd.hidden) return '';

  const displayName = parentPath ? buildDisplayName(parentPath, cmd.name) : `\`${cmd.name}\``;
  // For the TUI default-action pseudo-entry "(TUI)" there is no new path
  // segment — children would inherit the parent path.
  const childPath = cmd.name.startsWith('(')
    ? parentPath
    : parentPath
      ? `${parentPath} ${cmd.name}`
      : cmd.name;

  const heading = '#'.repeat(depth);
  const subHeading = '#'.repeat(depth + 1);
  const parts: string[] = [`${heading} ${displayName}`, '', cmd.description, ''];

  if (cmd.synopsis) {
    parts.push(`${subHeading} Synopsis`, '', cmd.synopsis, '');
  }

  if (cmd.examples !== undefined) {
    parts.push(`${subHeading} Examples`, '', renderExamples(cmd.examples, displayName));
  }

  for (const group of cmd.optionGroups ?? []) {
    const requiredTable = renderRequiredOptionsTable(group.options);
    if (requiredTable) {
      parts.push(`${subHeading} Required options`, '', requiredTable);
    }
    parts.push(`${subHeading} ${group.title}`, '', renderOptionsTable(group.options));
  }

  if (cmd.notes) parts.push(cmd.notes, '');

  const visibleChildren = (cmd.children ?? []).filter((c) => !c.hidden);
  if (visibleChildren.length > 0) {
    parts.push(`${subHeading} Subcommands`, '');
    for (const child of visibleChildren) {
      const childDisplayName = buildDisplayName(childPath, child.name);
      const anchor = childDisplayName
        .replace(/`/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      parts.push(`- [${childDisplayName}](#${anchor})`);
    }
    parts.push('');
  }

  for (const child of cmd.children ?? []) {
    const rendered = renderCommand(child, depth + 1, childPath);
    if (rendered) parts.push(rendered);
  }

  return parts.join('\n');
}

function buildDoc(): string {
  // Construct the same RootCommand instance that the CLI wires at runtime.
  // The dummy program / version / exitHandler are never invoked — only the
  // command metadata is read.
  const root = new RootCommand({
    program: new Command(),
    version: '0.0.0-doc',
    exitHandler: new ExitHandler(),
  });

  const header = [
    '<!-- AUTO-GENERATED by packages/cli/scripts/gen_docs.ts. Do not edit by hand. -->',
    '<!-- Run: bun packages/cli/scripts/gen_docs.ts -->',
    '',
    '# GitLab Duo CLI (beta) reference',
    '',
  ].join('\n');
  return header + '\n' + renderCommand(root, 2);
}

const __filename = fileURLToPath(import.meta.url);
const outPath = join(dirname(__filename), '..', 'docs', 'cli-reference.md');

const rawDoc = buildDoc();
const prettierConfig = await prettier.resolveConfig(outPath);
const doc = await prettier.format(rawDoc, { ...prettierConfig, parser: 'markdown' });
const check = process.argv.includes('--check');

if (check) {
  const existing = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (existing !== doc) {
    process.stderr.write(`${outPath} is out of date. Run: bun packages/cli/scripts/gen_docs.ts\n`);
    process.exit(1);
  }
  process.stdout.write(`${outPath} is up to date.\n`);
} else {
  writeFileSync(outPath, doc);
  process.stdout.write(`Wrote ${outPath}\n`);
}

// ExitHandler installs SIGINT/SIGTERM listeners on construction. Force-exit
// once the script body is done so we don't block the runtime forever.
process.exit(0);
