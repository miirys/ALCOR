import { createInterfaceId } from '@gitlab/needle';
import type { ZodError } from 'zod';
import type { ServerName } from '../types';
import type { McpConfigurationError } from './errors';
import type { Configuration, ServerConfig } from './schema';

/**
 * Result of parsing a single server configuration
 */
export type ServerConfigParseResult =
  | {
      success: true;
      config: ServerConfig;
      hash: string; // SHA-256 hash of the raw config JSON
    }
  | {
      success: false;
      config: unknown; // The unparsed config object
      hash: string; // SHA-256 hash of the raw config JSON
      error: ZodError;
    };

/**
 * Successful resolution status for a single configuration file candidate.
 */
export type ConfigurationCandidateSuccessStatus = Readonly<{
  index: number; // precedence order: lower index = higher precedence
  path: string; // filesystem path to the configuration file
  status: 'ok';
  config: Configuration; // validated configuration
  serverResults: Record<ServerName, ServerConfigParseResult>; // per-server parse results
  displayNames: Record<ServerName, string>; // slug → original display name mapping
}>;

/**
 * Failure status for a single configuration file candidate.
 */
type ConfigurationCandidateFailureStatus = Readonly<{
  index: number; // precedence order: lower index = higher precedence
  path: string; // filesystem path to the configuration file
  status: 'error';
  error: McpConfigurationError;
}>;

/**
 * Union of candidate statuses.
 */
export type ConfigurationCandidateStatus =
  | ConfigurationCandidateSuccessStatus
  | ConfigurationCandidateFailureStatus;

/**
 * Tracks where each final server configuration originated from and which
 * candidates also defined it (for duplicate detection and diagnostics).
 */
export type ConfigurationServersOrigin = Record<
  ServerName,
  {
    index: number; // index of the winning candidate
    displayName: string;
    resolvedPath: string; // path of the winning candidate
    paths: string[]; // all candidate paths that declared this server
    hash: string; // hash of the server config for change detection
    parseResult: ServerConfigParseResult; // parse result including any errors
  }
>;

/**
 * Final result after loading and merging multiple configuration files.
 */
export type ResolvedMergedConfiguration = Readonly<{
  config: Configuration; // merged configuration
  serversOrigin: ConfigurationServersOrigin; // origin metadata
  diagnostics: Record<string, ConfigurationCandidateStatus>; // per-path status
}>;

/**
 * Service contract for loading, validating, and merging configuration files.
 * Implementations must not throw; all failures are represented as results.
 */
export interface McpConfigResolver {
  /**
   * Loads configuration files from the given paths (higher precedence first),
   * parses JSON, validates against the schema, and merges them.
   *
   * The returned result contains the merged configuration along with full
   * diagnostics and origin tracking for auditing and UX.
   */
  loadAndMerge(filePaths: string[]): Promise<ResolvedMergedConfiguration>;
}

export const McpConfigResolver = createInterfaceId<McpConfigResolver>('McpConfigResolver');
