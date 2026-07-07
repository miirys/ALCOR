import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { tryParseFlowConfig } from '@gitlab-lsp/workflow-api';

const FLOW_CONFIG_FILE_EXTENSIONS = ['.yaml', '.yml', '.json'];

export class FlowConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowConfigError';
  }
}

function looksLikeFlowConfigFilePath(value: string): boolean {
  if (isAbsolute(value)) {
    return true;
  }

  if (value.startsWith('./') || value.startsWith('.\\')) {
    return true;
  }

  return FLOW_CONFIG_FILE_EXTENSIONS.some((ext) => value.endsWith(ext));
}

function resolveFlowConfigValue(value: string, cwd: string): string {
  const resolvedPath = resolve(cwd, value);

  if (existsSync(resolvedPath)) {
    try {
      return readFileSync(resolvedPath, 'utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      throw new FlowConfigError(`Could not read flow config file "${resolvedPath}": ${message}`);
    }
  }

  if (looksLikeFlowConfigFilePath(value)) {
    throw new FlowConfigError(
      `Flow config file not found: "${resolvedPath}". ` +
        'Provide a valid file path or pass the YAML/JSON content directly.',
    );
  }

  return value;
}

/**
 * Parses a flow config option value, which can be either:
 * - A file path (resolved relative to cwd) containing YAML/JSON
 * - Raw YAML/JSON content
 *
 * @returns The validated flow config content string
 * @throws FlowConfigError if file not found, unreadable, or content is invalid YAML/JSON
 */
export function parseFlowConfigOption(value: string, cwd: string = process.cwd()): string {
  if (!value) return value;

  const content = resolveFlowConfigValue(value, cwd);

  try {
    tryParseFlowConfig(content);
    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    throw new FlowConfigError(`Could not parse flow config: ${message}`);
  }
}
