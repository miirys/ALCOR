import {
  ServiceCollection,
  createInstanceDescriptor,
  createFactoryDescriptor,
  ServiceLifetime,
} from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { DefaultWorkflowTokenService } from '@gitlab-org/workflow-executor';
import { RunGitCommandActionHandler } from '@gitlab-org/workflow-executor/node';
import { WorkflowRunner } from '@gitlab-lsp/workflow-api';
import { DefaultOSContextProvider } from '@gitlab-org/ai-context/node';
import { CliApiService } from '../../cli_api_service';
import { ToolInputFormatterService } from '../tool_input_formatter';
import { SessionDataService } from '../../sessions/session_data_service';
import { LocalSessionStore } from '../../sessions/local_session_store';
import { LocalFirstSessionDataService } from '../../sessions/local_session_data_service';
import { GitLabBackendFactory } from './gitlab_backend_factory';
import { GitLabModelManager } from './gitlab_model_manager';
import { RootNamespaceIdService } from './root_namespace_id_service';
import { GitLabSessionDataService } from './session_data_service';
import { PreConfiguredCliApiService } from './preconfigured_cli_api_service';
import { GitLabParsedOptions, validateCiTokenConfiguration } from './gitlab_parsed_options';
import { PreConfiguredWorkflowTokenService } from './preconfigured_workflow_token_service';
import { OSInformationContextProvider } from './system_context/os_information';
import { ShellContextProvider } from './system_context/shell';

/**
 * Registers the GitLab backend factory and all GitLab-specific services.
 *
 * @param serviceCollection - The service collection to register services with
 * @param backendOpts - The parsed GitLab-specific options
 * @param commandName - The CLI command name ('tui' or 'run')
 */
export function registerGitLabServices(
  serviceCollection: ServiceCollection,
  backendOpts: GitLabParsedOptions,
  commandName: 'tui' | 'run' = 'tui',
): void {
  // Register GitLabParsedOptions for DI injection
  serviceCollection.add(
    createInstanceDescriptor({
      instance: backendOpts,
      aliases: [GitLabParsedOptions],
    }),
  );

  serviceCollection.addClass(GitLabModelManager);
  serviceCollection.addClass(RootNamespaceIdService);
  serviceCollection.addClass(GitLabBackendFactory);
  serviceCollection.addClass(RunGitCommandActionHandler);

  // Patch A (local-first session store): the SessionDataService binding is
  // swapped to LocalFirstSessionDataService; the GitLab-backed impl stays as
  // its best-effort upstream mirror. Constructed via a factory (instead of
  // addClass) because GitLabSessionDataService's @Implements would otherwise
  // claim the SessionDataService token itself.
  serviceCollection.add(
    createFactoryDescriptor({
      aliases: [SessionDataService],
      factory: (locator) => {
        const logger = locator.getRequiredService(Logger);
        const upstream = new GitLabSessionDataService(
          logger,
          locator.getRequiredService(WorkflowRunner),
          locator.getRequiredService(ToolInputFormatterService),
        );
        return new LocalFirstSessionDataService({
          local: new LocalSessionStore({ logger }),
          logger,
        }).setUpstream(upstream);
      },
      lifetime: ServiceLifetime.Singleton,
    }),
  );

  // Determine if we're in headless CI mode: requires both the 'run' command
  // and workflow service fields to be present.
  const isHeadlessRunCIMode =
    commandName === 'run' &&
    Boolean(backendOpts.duoWorkflowServiceServer && backendOpts.duoWorkflowServiceToken);

  if (isHeadlessRunCIMode) {
    // Validate CI token configuration eagerly during registration
    validateCiTokenConfiguration(backendOpts);

    serviceCollection.addClass(PreConfiguredWorkflowTokenService, PreConfiguredCliApiService);

    serviceCollection.addClass(OSInformationContextProvider);
  } else {
    serviceCollection.addClass(DefaultWorkflowTokenService, CliApiService);
  }

  // Backend requires OS info as XML rather than JSON, with a different `category` for headless runs
  if (!isHeadlessRunCIMode) {
    serviceCollection.addClass(
      commandName === 'run' ? OSInformationContextProvider : DefaultOSContextProvider,
    );
  }

  // Shell context (cwd + shell type) is useful in all modes
  serviceCollection.addClass(ShellContextProvider);
}
