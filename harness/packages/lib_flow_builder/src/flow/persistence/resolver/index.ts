import { err, Result } from 'neverthrow';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import type { Flow } from '../../types';
import { FlowValidationCode } from '../../validation/codes';
import { ConversionError } from './errors';
import { FlowV1Converter } from './v1';
import { FlowConverter } from './types';

/**
 * Flow Resolver
 *
 * Routes unknown data to the appropriate converter based on version
 */
@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [Logger, FlowV1Converter],
})
export class FlowResolver {
  #logger: Logger;

  #converters: Map<string, FlowConverter>;

  constructor(logger: Logger, v1Converter: FlowV1Converter) {
    this.#logger = logger;

    // Register all converters
    this.#converters = new Map([
      ['v1', v1Converter],
      // Future: ['v2', new FlowV2Converter()],
    ]);
  }

  /**
   * Convert unknown data to Flow
   *
   * Automatically detects version and uses appropriate converter
   */
  toFlow(data: unknown): Result<Flow, ConversionError> {
    // Detect version
    const version = this.#detectVersion(data);

    if (!version) {
      return err(
        ConversionError.schemaValidation('Unable to detect flow version', [
          {
            severity: 'error',
            code: FlowValidationCode.Schema,
            message: 'Missing or invalid "version" field',
            fieldPath: 'version',
          },
        ]),
      );
    }

    // Get converter
    const converter = this.#converters.get(version);

    if (!converter) {
      return err(
        ConversionError.schemaValidation(`Unsupported flow version: ${version}`, [
          {
            severity: 'error',
            code: FlowValidationCode.Schema,
            message: `Supported versions: ${Array.from(this.#converters.keys()).join(', ')}`,
            fieldPath: 'version',
          },
        ]),
      );
    }

    this.#logger.debug(`Converting flow using ${version} converter`);
    return converter.toFlow(data);
  }

  /**
   * Convert Flow to GitLab format
   *
   * Uses specified version or defaults to latest (v1)
   */
  fromFlow(flow: Flow, version: string = 'v1'): Result<unknown, ConversionError> {
    const converter = this.#converters.get(version);

    if (!converter) {
      return err(ConversionError.conversionFailed(`Unsupported flow version: ${version}`));
    }

    this.#logger.debug(`Converting flow to ${version} format`);
    return converter.fromFlow(flow);
  }

  /**
   * Get list of supported versions
   */
  getSupportedVersions(): string[] {
    return Array.from(this.#converters.keys());
  }

  /**
   * Detect version from data
   */
  #detectVersion(data: unknown): string | null {
    if (typeof data !== 'object' || data === null) {
      return null;
    }

    const obj = data as Record<string, unknown>;
    const { version } = obj;

    if (typeof version !== 'string') {
      return null;
    }

    return version;
  }
}

// Re-export for convenience
export { ConversionError } from './errors';
export type { FlowConverter } from './types';
export { toComponentName, fromComponentName } from '../../utils/component_name';
export type { FlowV1 } from './v1';
