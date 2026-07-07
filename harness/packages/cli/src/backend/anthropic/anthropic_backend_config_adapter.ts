import type { Command } from 'commander';
import type { ServiceCollection } from '@gitlab/needle';
import type { BackendConfigAdapter } from '../backend_config_adapter';
import { registerOptionsOnCommand } from '../../option_def';
import { anthropicOptionDefs } from '../../backend_option_defs';
import { registerAnthropicServices } from './di';
import { type AnthropicParsedOptions, anthropicOptionSchema } from './anthropic_parsed_options';

export type { AnthropicModel } from './anthropic_parsed_options';
export { AnthropicParsedOptions } from './anthropic_parsed_options';

export class AnthropicBackendConfigAdapter implements BackendConfigAdapter<AnthropicParsedOptions> {
  registerOptions(command: Command): void {
    registerOptionsOnCommand(command, anthropicOptionDefs);
  }

  parseOptions(allOpts: Record<string, unknown>): AnthropicParsedOptions {
    return anthropicOptionSchema.parse(allOpts);
  }

  registerServices(
    serviceCollection: ServiceCollection,
    backendOpts: AnthropicParsedOptions,
  ): void {
    registerAnthropicServices(serviceCollection, backendOpts);
  }
}
