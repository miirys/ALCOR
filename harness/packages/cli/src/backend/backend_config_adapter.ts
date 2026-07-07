import type { Command } from 'commander';
import type { ServiceCollection } from '@gitlab/needle';
import type { ParsedCliInput } from '../parse';

export interface BackendConfigAdapter<TBackendOpts = {}> {
  /**
   * Decorate a Command with additional backend-specific options
   */
  registerOptions(command: Command): void;

  /**
   * Parse and validate backend-specific options from raw Commander output.
   */
  parseOptions(allOpts: Record<string, unknown>): TBackendOpts;

  /**
   * Register all backend services into the service collection.
   */
  registerServices(
    serviceCollection: ServiceCollection,
    backendOpts: TBackendOpts,
    cliInput: ParsedCliInput,
  ): void;
}
