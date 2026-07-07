import * as fs from 'fs/promises';
import * as path from 'path';
import { Service, Implements, ServiceLifetime, createInterfaceId } from '@gitlab/needle';
import { ResultAsync, Result, err, ok } from 'neverthrow';
import { Logger, withPrefix } from '@gitlab-org/logging';

import { parseJSONC, stringifyJSON } from 'confbox';
import type { ServerName } from '../types';
import { McpConfigurationError } from './errors';
import { ServerConfig } from './schema';

/**
 * Service for writing MCP configuration files while preserving
 * comments, formatting, and existing content.
 */
export interface McpConfigWriter {
  /**
   * Add or update a server in the specified file.
   * Preserves comments and formatting using jsonc-parser.
   *
   * @param filePath - Absolute path to the config file
   * @param serverName - Name of the server to add/update
   * @param config - Server configuration
   */
  upsertServer(
    filePath: string,
    serverName: ServerName,
    config: ServerConfig,
  ): ResultAsync<void, McpConfigurationError>;

  /**
   * Remove a server from the specified file.
   * Preserves comments and formatting.
   *
   * @param filePath - Absolute path to the config file
   * @param serverName - Name of the server to delete
   */
  deleteServer(filePath: string, serverName: ServerName): ResultAsync<void, McpConfigurationError>;

  /**
   * Ensure config file exists with valid structure.
   * Creates directory and file if needed.
   *
   * @param filePath - Absolute path to the config file
   * @param options.managed - Whether the file may be programmatically rewritten.
   *   Defaults to `true`. Pass `false` for user-authored files that should not be
   *   reformatted without warning (e.g. CLI's "open in editor" flow). When `false`,
   *   an existing file with an invalid structure is left untouched rather than
   *   reinitialised, so the user's contents are never discarded.
   */
  ensureConfigFile(
    filePath: string,
    options?: { managed?: boolean },
  ): ResultAsync<void, McpConfigurationError>;

  /**
   * Check if a config file is managed by our tooling.
   * Returns true if the file has `_managed: true`, false otherwise.
   *
   * @param filePath - Absolute path to the config file
   */
  isManagedConfig(filePath: string): ResultAsync<boolean, McpConfigurationError>;
}

export const McpConfigWriter = createInterfaceId<McpConfigWriter>('McpConfigWriter');

@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(McpConfigWriter)
export class DefaultMcpConfigWriter implements McpConfigWriter {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[MCP][ConfigWriter]');
  }

  upsertServer(
    filePath: string,
    serverName: ServerName,
    config: ServerConfig,
  ): ResultAsync<void, McpConfigurationError> {
    this.#logger.debug(`Upserting server "${serverName}" to ${filePath}`);

    return this.ensureConfigFile(filePath)
      .andThen(() => this.#readFileContents(filePath))
      .andThen((content) => {
        // Validate the server config before writing
        const validationResult = ServerConfig.safeParse(config);
        if (!validationResult.success) {
          return err(McpConfigurationError.fileValidationError(filePath, validationResult.error));
        }

        // Parse and validate structure
        const parsed = parseJSONC(content);
        const validated = this.#validateConfigStructure(parsed, filePath);

        if (validated.isErr()) {
          return err(validated.error);
        }

        // Update server configuration (create a copy to avoid mutation)
        const updatedConfig = {
          ...validated.value,
          mcpServers: { ...validated.value.mcpServers },
          _managed: true,
        };
        updatedConfig.mcpServers[serverName] = config;

        return ok(stringifyJSON(updatedConfig));
      })
      .andThen((newContent) => this.#writeFileContents(filePath, newContent))
      .map(() => {
        this.#logger.info(`Successfully upserted server "${serverName}" to ${filePath}`);
        return undefined;
      });
  }

  deleteServer(filePath: string, serverName: ServerName): ResultAsync<void, McpConfigurationError> {
    this.#logger.debug(`Deleting server "${serverName}" from ${filePath}`);

    return this.#readFileContents(filePath)
      .andThen((content) => {
        // Parse and validate structure
        const parsed = parseJSONC(content);
        const validated = this.#validateConfigStructure(parsed, filePath);

        if (validated.isErr()) {
          return err(validated.error);
        }

        // Check if server exists before attempting delete
        if (!(serverName in validated.value.mcpServers)) {
          return err(McpConfigurationError.serverNotFoundError(filePath, serverName));
        }

        // Delete the server (create a copy to avoid mutation)
        const updatedConfig = {
          ...validated.value,
          mcpServers: { ...validated.value.mcpServers },
          _managed: true,
        };
        delete updatedConfig.mcpServers[serverName];

        // Stringify with confbox
        return ok(stringifyJSON(updatedConfig));
      })
      .andThen((newContent) => this.#writeFileContents(filePath, newContent))
      .map(() => {
        this.#logger.info(`Successfully deleted server "${serverName}" from ${filePath}`);
        return undefined;
      });
  }

  ensureConfigFile(
    filePath: string,
    options: { managed?: boolean } = {},
  ): ResultAsync<void, McpConfigurationError> {
    const managed = options.managed ?? true;
    return ResultAsync.fromPromise(
      (async () => {
        // Check if file exists
        try {
          await fs.access(filePath);
          // File exists, validate it has proper structure
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = parseJSONC(content);
          const validationResult = this.#validateConfigStructure(parsed, filePath);

          // If file is empty or invalid, initialize it - but only for managed
          // files. An unmanaged file is user-authored; reinitialising would
          // silently discard its contents, so we leave it untouched and let the
          // user fix it
          if (validationResult.isErr()) {
            if (!managed) {
              this.#logger.warn(
                `Config file ${filePath} has invalid structure; leaving it untouched because it is unmanaged`,
              );
              return;
            }
            this.#logger.warn(`Config file ${filePath} has invalid structure, reinitializing`);
            await this.#initializeConfigFile(filePath, managed);
          }
        } catch (error) {
          const nodeErr = error as NodeJS.ErrnoException;
          if (nodeErr.code === 'ENOENT') {
            // File doesn't exist, create it
            this.#logger.info(`Creating new config file at ${filePath}`);
            await this.#initializeConfigFile(filePath, managed);
          } else {
            throw error;
          }
        }
      })(),
      (error: unknown) => McpConfigurationError.fileWriteError(filePath, error),
    );
  }

  isManagedConfig(filePath: string): ResultAsync<boolean, McpConfigurationError> {
    return this.#readFileContents(filePath)
      .andThen((content) => {
        try {
          const parsed = parseJSONC(content);
          const validated = this.#validateConfigStructure(parsed, filePath);

          if (validated.isErr()) {
            return ok(false); // Invalid structure, treat as not managed
          }

          // Check for _managed property
          const config = validated.value as { _managed?: boolean };
          // eslint-disable-next-line no-underscore-dangle
          return ok(config._managed === true);
        } catch {
          return ok(false); // Parse error, treat as not managed
        }
      })
      .orElse((error) => {
        // If file doesn't exist or can't be read, treat as not managed
        this.#logger.debug(`Could not check if ${filePath} is managed: ${error.message}`);
        return ok(false);
      });
  }

  // ---- Private Helpers ----

  /**
   * Validates that parsed JSON has the expected MCP config structure.
   * Returns Ok with validated config or Err with error.
   */
  #validateConfigStructure(
    parsed: unknown,
    filePath: string,
  ): Result<{ mcpServers: Record<string, unknown>; _managed?: boolean }, McpConfigurationError> {
    // Check if parsed is a non-null, non-array object
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return err(
        McpConfigurationError.fileReadError(
          filePath,
          new Error('Config file must contain a JSON object'),
        ),
      );
    }

    const config = parsed as Record<string, unknown>;

    // Check if mcpServers field exists and is an object
    if (!('mcpServers' in config)) {
      return err(
        McpConfigurationError.fileReadError(
          filePath,
          new Error('Config file must contain "mcpServers" field'),
        ),
      );
    }

    if (
      !config.mcpServers ||
      typeof config.mcpServers !== 'object' ||
      Array.isArray(config.mcpServers)
    ) {
      return err(
        McpConfigurationError.fileReadError(
          filePath,
          new Error('"mcpServers" must be a JSON object'),
        ),
      );
    }

    return ok(config as { mcpServers: Record<string, unknown>; _managed?: boolean });
  }

  #readFileContents(filePath: string): ResultAsync<string, McpConfigurationError> {
    return ResultAsync.fromPromise(fs.readFile(filePath, 'utf-8'), (error: unknown) => {
      const nodeErr = error as Partial<NodeJS.ErrnoException> | null;
      return nodeErr?.code === 'ENOENT'
        ? McpConfigurationError.fileNotFoundError(filePath)
        : McpConfigurationError.fileReadError(filePath, error);
    });
  }

  #writeFileContents(filePath: string, content: string): ResultAsync<void, McpConfigurationError> {
    return ResultAsync.fromPromise(fs.writeFile(filePath, content, 'utf-8'), (error: unknown) =>
      McpConfigurationError.fileWriteError(filePath, error),
    );
  }

  async #initializeConfigFile(filePath: string, managed: boolean): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const managedField = managed ? `\n  "_managed": true,` : '';
    const initialContent = `{${managedField}
  "mcpServers": {
    // Add your MCP server configurations here
    // See: https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/
  }
}
`;

    await fs.writeFile(filePath, initialContent, 'utf-8');
    this.#logger.info(`Initialized config file at ${filePath}`);
  }
}
