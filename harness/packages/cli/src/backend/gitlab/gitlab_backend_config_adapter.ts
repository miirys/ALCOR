import type { Command } from 'commander';
import type { ServiceCollection } from '@gitlab/needle';
import type { BackendConfigAdapter } from '../backend_config_adapter';
import { registerOptionsOnCommand } from '../../option_def';
import {
  gitlabSharedOptionDefs,
  gitlabRunOptionDefs,
  gitlabTuiOptionDefs,
  createFlowConfigOptionDef,
} from '../../backend_option_defs';
import type { ParsedCliInput } from '../../parse';
import { registerGitLabServices } from './di';
import { type GitLabParsedOptions, gitlabOptionSchema } from './gitlab_parsed_options';

export class GitLabBackendConfigAdapter implements BackendConfigAdapter<GitLabParsedOptions> {
  registerOptions(command: Command): void {
    registerOptionsOnCommand(command, gitlabSharedOptionDefs);

    if (command.name() === 'run') {
      registerOptionsOnCommand(command, gitlabRunOptionDefs);
      registerOptionsOnCommand(command, [
        createFlowConfigOptionDef(() => command.parent?.opts().cwd ?? process.cwd()),
      ]);
    } else {
      // Default-action (interactive TUI) command.
      registerOptionsOnCommand(command, gitlabTuiOptionDefs);
    }
  }

  parseOptions(allOpts: Record<string, unknown>): GitLabParsedOptions {
    return gitlabOptionSchema.parse(allOpts);
  }

  registerServices(
    serviceCollection: ServiceCollection,
    backendOpts: GitLabParsedOptions,
    cliInput: ParsedCliInput,
  ): void {
    registerGitLabServices(serviceCollection, backendOpts, cliInput.command.name);
  }
}
