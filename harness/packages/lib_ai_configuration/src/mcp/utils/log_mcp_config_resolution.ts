import type { Logger } from '@gitlab-org/logging';
import { treeifyError } from 'zod';
import type { ResolvedMergedConfiguration } from '../config';
import { ServerName } from '../types';

export function logMcpConfigResolution(
  logger: Logger,
  result: ResolvedMergedConfiguration,
  candidatePaths: string[],
): void {
  const statuses = Object.values(result.diagnostics);
  const successfulConfigs = statuses.filter((s) => s.status === 'ok');
  const failedConfigs = statuses.filter((s) => s.status === 'error');

  // Log successful loads
  if (successfulConfigs.length > 0) {
    const paths = successfulConfigs.map((s) => s.path).join(', ');
    logger.info(`[MCP] Successfully loaded ${successfulConfigs.length} config file(s): ${paths}`);
  }

  // Log total servers before merge
  const totalServersBeforeMerge = successfulConfigs.reduce(
    (sum, s) => sum + Object.keys(s.config.mcpServers).length,
    0,
  );

  if (totalServersBeforeMerge > 0) {
    logger.info(`[MCP] Found ${totalServersBeforeMerge} total server(s) across all config files`);
  }

  // Log failures with detailed errors
  failedConfigs.forEach((status) => {
    const { error, path: filePath } = status;

    switch (error.code) {
      case 'MCP_CONFIGURATION_FILE_NOT_FOUND_ERROR':
        logger.debug(`[MCP] Config file not found: ${filePath}`);
        break;

      case 'MCP_CONFIGURATION_FILE_READ_ERROR':
        logger.error(`[MCP] Failed to read config file ${filePath}: ${error.message}`);
        if (error.cause) {
          logger.debug(`[MCP] IO error details: ${error.cause}`);
        }
        break;

      case 'MCP_CONFIGURATION_FILE_JSON_PARSE_ERROR':
        logger.error(`[MCP] Invalid JSON in config file ${filePath}`);
        if (error.cause) {
          logger.debug(`[MCP] Parse error: ${error.cause}`);
        }
        break;

      case 'MCP_CONFIGURATION_FILE_VALIDATION_ERROR': {
        logger.error(`[MCP] Validation failed for ${filePath}:`);
        const tree = treeifyError(error.issues);
        logger.debug(JSON.stringify(tree, null, 2));
        break;
      }
      default:
        logger.error(`[MCP] Unexpected error with config file ${filePath}: ${error}`);
    }
  });

  // Log duplicate servers with precedence info
  const duplicateServers = Object.entries(result.serversOrigin)
    .filter(([, origin]) => origin.paths.length > 1)
    .map(([key, origin]) => ({
      key,
      winner: origin.resolvedPath,
      winnerIndex: origin.index,
      losers: origin.paths.filter((path) => path !== origin.resolvedPath),
    }));

  if (duplicateServers.length > 0) {
    logger.info(`[MCP] Found ${duplicateServers.length} duplicate server definition(s)`);

    duplicateServers.forEach((dup) => {
      logger.info(
        `[MCP] Server '${dup.key}' defined in multiple configs. ` +
          `Using definition from '${dup.winner}' (priority ${dup.winnerIndex + 1}), ` +
          `ignoring: ${dup.losers.join(', ')}`,
      );
    });
  }

  const finalServers = Object.entries(result.config.mcpServers);

  if (finalServers.length > 0) {
    const serverDetails = finalServers.map(([key, server]) => {
      const { type } = server;
      const origin = result.serversOrigin[key as ServerName];
      return `${key} (${type} from ${origin?.resolvedPath})`;
    });

    logger.debug(
      `[MCP] Final merged configuration contains ${finalServers.length} server(s): ${serverDetails.join(', ')}`,
    );
  } else if (successfulConfigs.length > 0) {
    logger.warn('[MCP] No servers found in any configuration files');
  }

  // Log config precedence order
  if (candidatePaths.length > 1) {
    logger.debug(`[MCP] Config file precedence (highest to lowest): ${candidatePaths.join(' > ')}`);
  }

  // Log server type summary
  const serverTypeCounts = finalServers.reduce(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (acc, [_, server]) => {
      const { type } = server;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  if (Object.keys(serverTypeCounts).length > 0) {
    const typeSummary = Object.entries(serverTypeCounts)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    logger.debug(`[MCP] Server types: ${typeSummary}`);
  }
}
