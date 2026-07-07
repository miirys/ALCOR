import type { z } from 'zod';
import { type ErrorBase, createError } from '../../core/error';

/**
 * Represents an error that occurred while attempting to read a configuration file from disk.
 */
type ConfigurationFileReadError = ErrorBase<
  'MCP_CONFIGURATION_FILE_READ_ERROR',
  { filePath: string; cause?: unknown }
>;

/**
 * Represents an error where the configuration file could not be found at the given path.
 */
type ConfigurationFileNotFoundError = ErrorBase<
  'MCP_CONFIGURATION_FILE_NOT_FOUND_ERROR',
  { filePath: string }
>;

/**
 * Represents an error where the configuration file contains invalid JSON.
 */
export type ConfigurationFileJsonParseError = ErrorBase<
  'MCP_CONFIGURATION_FILE_JSON_PARSE_ERROR',
  { filePath: string; cause?: unknown }
>;

/**
 * Represents an error where the configuration file’s contents failed schema validation.
 */
type ConfigurationFileValidationError = ErrorBase<
  'MCP_CONFIGURATION_FILE_VALIDATION_ERROR',
  { filePath: string; issues: z.ZodError }
>;

/**
 * Represents an error that occurred while attempting to write to a configuration file.
 */
type ConfigurationFileWriteError = ErrorBase<
  'MCP_CONFIGURATION_FILE_WRITE_ERROR',
  { filePath: string; cause?: unknown }
>;

/**
 * Represents an error where a server was not found in the configuration file.
 */
type ConfigurationServerNotFoundError = ErrorBase<
  'MCP_CONFIGURATION_SERVER_NOT_FOUND_ERROR',
  { filePath: string; serverName: string }
>;

/**
 * Union of all configuration-related errors.
 */
export type McpConfigurationError =
  | ConfigurationFileReadError
  | ConfigurationFileNotFoundError
  | ConfigurationFileJsonParseError
  | ConfigurationFileValidationError
  | ConfigurationFileWriteError
  | ConfigurationServerNotFoundError;

/**
 * Factory functions for creating configuration-related errors.
 */
export const McpConfigurationError = {
  fileReadError: (filePath: string, cause?: unknown): ConfigurationFileReadError =>
    createError(
      'MCP_CONFIGURATION_FILE_READ_ERROR',
      `Failed to read configuration file: ${filePath}`,
      { filePath, cause },
    ),

  fileNotFoundError: (filePath: string): ConfigurationFileNotFoundError =>
    createError(
      'MCP_CONFIGURATION_FILE_NOT_FOUND_ERROR',
      `Configuration file not found: ${filePath}`,
      { filePath },
    ),

  fileJsonParseError: (filePath: string, cause?: unknown): ConfigurationFileJsonParseError =>
    createError(
      'MCP_CONFIGURATION_FILE_JSON_PARSE_ERROR',
      `Invalid JSON in configuration file: ${filePath}`,
      { filePath, cause },
    ),

  fileValidationError: (filePath: string, issues: z.ZodError): ConfigurationFileValidationError =>
    createError(
      'MCP_CONFIGURATION_FILE_VALIDATION_ERROR',
      `Configuration validation failed: ${filePath}`,
      { filePath, issues },
    ),

  fileWriteError: (filePath: string, cause?: unknown): ConfigurationFileWriteError =>
    createError(
      'MCP_CONFIGURATION_FILE_WRITE_ERROR',
      `Failed to write configuration file: ${filePath}`,
      { filePath, cause },
    ),

  serverNotFoundError: (filePath: string, serverName: string): ConfigurationServerNotFoundError =>
    createError(
      'MCP_CONFIGURATION_SERVER_NOT_FOUND_ERROR',
      `Server "${serverName}" not found in configuration file: ${filePath}`,
      { filePath, serverName },
    ),
} as const;
