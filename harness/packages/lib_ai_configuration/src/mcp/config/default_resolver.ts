import { createHash } from 'crypto';
import { Service, Implements, ServiceLifetime } from '@gitlab/needle';

import { parseJSONC, type JSONCParseError } from 'confbox';
import { Result, ResultAsync, err, ok } from 'neverthrow';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ServerName } from '../types';
import { slugifyServerName } from '../utils';
import {
  McpConfigurationError as ConfigError,
  ConfigurationFileJsonParseError,
  McpConfigurationError,
} from './errors';
import {
  BasicConfiguration,
  Configuration,
  ServerConfig,
  type ServerConfig as ServerConfigType,
} from './schema';
import {
  ConfigurationCandidateStatus,
  ConfigurationCandidateSuccessStatus,
  McpConfigResolver,
  ResolvedMergedConfiguration,
  ServerConfigParseResult,
} from './types';

function isSuccess(
  candidate: ConfigurationCandidateStatus,
): candidate is ConfigurationCandidateSuccessStatus {
  return candidate.status === 'ok';
}

function isFileNotFoundError(candidate: ConfigurationCandidateStatus): boolean {
  return (
    candidate.status === 'error' &&
    candidate.error?.code === 'MCP_CONFIGURATION_FILE_NOT_FOUND_ERROR'
  );
}

const EMPTY_RESOLVED_MCP_CONFIG: Readonly<ResolvedMergedConfiguration> = {
  config: { mcpServers: {} },
  serversOrigin: {},
  diagnostics: {},
};

@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(McpConfigResolver)
export class DefaultMcpConfigResolver implements McpConfigResolver {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[MCP][Config]');
  }

  async loadAndMerge(filePaths: string[]): Promise<ResolvedMergedConfiguration> {
    if (filePaths.length === 0) {
      return EMPTY_RESOLVED_MCP_CONFIG;
    }

    const resolutionTasks = filePaths.map(async (filePath, index) => {
      const result = await this.#loadAndValidate(filePath);
      return result.match<ConfigurationCandidateStatus>(
        ({ config, serverResults, displayNames }) => ({
          index,
          path: filePath,
          status: 'ok',
          config,
          serverResults,
          displayNames,
        }),
        (error) => ({ index, path: filePath, status: 'error', error }),
      );
    });

    const candidates = await Promise.all(resolutionTasks);

    const successCount = candidates.filter((c) => c.status === 'ok').length;
    const notFoundCount = candidates.filter(isFileNotFoundError).length;
    const errorCount = candidates.filter(
      (c) => c.status === 'error' && !isFileNotFoundError(c),
    ).length;
    const totalServers = candidates
      .filter((c): c is ConfigurationCandidateSuccessStatus => c.status === 'ok')
      .reduce((sum, c) => sum + Object.keys(c.serverResults).length, 0);
    const validServers = candidates
      .filter((c): c is ConfigurationCandidateSuccessStatus => c.status === 'ok')
      .reduce((sum, c) => sum + Object.keys(c.config.mcpServers).length, 0);

    this.#logger.info(
      `configs_loaded — total=${candidates.length} ok=${successCount} not_found=${notFoundCount} error=${errorCount} servers=${validServers}/${totalServers}`,
    );

    return this.#mergeCandidates(candidates);
  }

  // ---- private helpers ------------------------

  #readFileContents(filePath: string) {
    return ResultAsync.fromPromise(
      import('fs/promises').then((fs) => fs.readFile(filePath, 'utf8')),
      (error: unknown) => {
        const nodeErr = error as Partial<NodeJS.ErrnoException> | null;
        return nodeErr?.code === 'ENOENT'
          ? ConfigError.fileNotFoundError(filePath)
          : ConfigError.fileReadError(filePath, error);
      },
    );
  }

  #parseJsonContents(
    filePath: string,
    rawContents: string,
  ): Result<unknown, ConfigurationFileJsonParseError> {
    const errors: JSONCParseError[] = [];

    // parseJSONC doesn't throw, but we wrap for safety and consistency
    const safeParseJSONC = Result.fromThrowable(
      () => parseJSONC(rawContents, { errors, allowTrailingComma: true }),
      (error: unknown) => ConfigError.fileJsonParseError(filePath, error),
    );

    const parseResult = safeParseJSONC();

    // Check for parsing errors captured in the errors array
    if (errors.length > 0) {
      const error = errors[0];
      const message = `[MCP] JSON parsing error at offset ${error?.offset} (length: ${error?.length})`;
      return err(ConfigError.fileJsonParseError(filePath, new Error(message)));
    }

    return parseResult;
  }

  /**
   * Hash a server config object to detect changes
   */
  #hashServerConfig(serverConfig: unknown): string {
    const json = JSON.stringify(serverConfig);
    return createHash('sha256').update(json).digest('hex');
  }

  /**
   * Parse a single server config with hash and error tracking
   */
  #parseServerConfig(rawConfig: unknown): ServerConfigParseResult {
    const hash = this.#hashServerConfig(rawConfig);
    const parsed = ServerConfig.safeParse(rawConfig);

    if (parsed.success) {
      return {
        success: true,
        config: parsed.data,
        hash,
      };
    }

    return {
      success: false,
      config: rawConfig,
      hash,
      error: parsed.error,
    };
  }

  /**
   * Validate basic configuration shape and parse individual servers
   */
  #validateConfiguration(
    filePath: string,
    untypedValue: unknown,
  ): Result<
    {
      config: Configuration;
      serverResults: Record<string, ServerConfigParseResult>;
      displayNames: Record<string, string>;
    },
    McpConfigurationError
  > {
    const basicParsed = BasicConfiguration.safeParse(untypedValue);
    if (!basicParsed.success) {
      return err(ConfigError.fileValidationError(filePath, basicParsed.error));
    }

    const slugToRawName = new Map<string, string>();

    const resolved = Object.entries(basicParsed.data.mcpServers)
      .map(([rawName, rawConfig]) =>
        this.#resolveServerEntry(filePath, rawName, rawConfig, slugToRawName),
      )
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const serverResults: Record<string, ServerConfigParseResult> = {};
    const validServers: Record<string, ServerConfigType> = {};
    const displayNames: Record<ServerName, string> = {};

    for (const { slug, displayName, parseResult } of resolved) {
      serverResults[slug] = parseResult;
      displayNames[slug] = displayName;

      if (parseResult.success) {
        validServers[slug] = parseResult.config;
      }
    }

    const config: Configuration = { mcpServers: validServers };
    return ok({ config, serverResults, displayNames });
  }

  /**
   * Slugify, validate, and parse a single server entry from config.
   * Returns null (with logging) if the entry should be skipped.
   */
  #resolveServerEntry(
    filePath: string,
    rawName: string,
    rawConfig: unknown,
    slugToRawName: Map<string, string>,
  ): {
    slug: ServerName;
    displayName: string;
    parseResult: ServerConfigParseResult;
  } | null {
    const slug = slugifyServerName(rawName);

    if (!slug) {
      this.#logger.warn(
        `Server "${rawName}" in ${filePath}: name could not be converted to a valid server identifier, skipping`,
      );
      return null;
    }

    const existingRaw = slugToRawName.get(slug);
    if (existingRaw && existingRaw !== rawName) {
      this.#logger.warn(
        `Server names "${rawName}" and "${existingRaw}" in ${filePath} both resolve to ` +
          `internal identifier "${slug}". Keeping "${existingRaw}", skipping "${rawName}".`,
      );
      return null;
    }

    slugToRawName.set(slug, rawName);

    const parseResult = this.#parseServerConfig(rawConfig);

    if (!parseResult.success) {
      this.#logServerValidationErrors(rawName, filePath, parseResult);
    }

    return { slug, displayName: rawName, parseResult };
  }

  /**
   * Log user-friendly validation errors for a server config.
   */
  #logServerValidationErrors(
    rawName: string,
    filePath: string,
    parseResult: Extract<ServerConfigParseResult, { success: false }>,
  ): void {
    const errorMessages = parseResult.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'config';
      let { message } = issue;

      if (path === 'type' || issue.path.includes('type')) {
        message = `The "type" field is required and must be one of: "stdio", "sse", or "http"`;
      }

      return `  - Field "${path}": ${message}`;
    });

    const hasTypeError = parseResult.error.issues.some(
      (issue) => issue.path.includes('type') || issue.path[0] === 'type',
    );
    const hint = hasTypeError
      ? '\n  Hint: See https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/ for configuration details'
      : '';

    this.#logger.warn(
      `Server "${rawName}" has invalid config in ${filePath}:\n${errorMessages.join('\n')}${hint}`,
    );
  }

  #loadAndValidate(filePath: string) {
    return this.#readFileContents(filePath)
      .andThen((rawContents) => this.#parseJsonContents(filePath, rawContents))
      .andThen((jsonValue) => this.#validateConfiguration(filePath, jsonValue));
  }

  #mergeCandidates(candidates: ConfigurationCandidateStatus[]): ResolvedMergedConfiguration {
    const initial: ResolvedMergedConfiguration = {
      config: { mcpServers: {} },
      serversOrigin: {},
      diagnostics: {},
    };

    // Earlier index wins, so sort ascending (higher precedence first)
    const orderedCandidates = [...candidates].sort((a, b) => a.index - b.index);

    const merged = orderedCandidates.reduce<ResolvedMergedConfiguration>((acc, candidate) => {
      // Always record diagnostics
      acc.diagnostics[candidate.path] = candidate;

      if (isSuccess(candidate)) {
        // Process all servers from this candidate (both valid and invalid)
        for (const [serverName, parseResult] of Object.entries(candidate.serverResults) as [
          ServerName,
          ServerConfigParseResult,
        ][]) {
          if (!(serverName in acc.serversOrigin)) {
            // First time we see this server name => winner based on precedence
            (acc.serversOrigin as Record<string, unknown>)[serverName] = {
              index: candidate.index,
              displayName: candidate.displayNames[serverName] ?? serverName,
              resolvedPath: candidate.path,
              paths: [candidate.path],
              hash: parseResult.hash,
              parseResult,
            };

            // Only add to merged config if it's valid
            if (parseResult.success) {
              (acc.config.mcpServers as Record<string, ServerConfigType>)[serverName] =
                parseResult.config;
            }
          } else {
            // Duplicate definition => only track origin
            const origin = (acc.serversOrigin as Record<string, { paths: string[] }>)[serverName];
            if (origin) {
              origin.paths.push(candidate.path);
            }
          }
        }
      }

      return acc;
    }, initial);

    const totalServers = Object.keys(merged.serversOrigin).length;
    const validServers = Object.keys(merged.config.mcpServers).length;
    const invalidServers = totalServers - validServers;

    if (totalServers === 0 && orderedCandidates.some((c) => c.status === 'ok')) {
      this.#logger.warn('no_servers_found_in_valid_configs');
    } else if (invalidServers > 0) {
      this.#logger.warn(`${invalidServers} server(s) have invalid configuration`);
    } else {
      this.#logger.debug(`${validServers} server(s) loaded`);
    }

    return merged;
  }
}
