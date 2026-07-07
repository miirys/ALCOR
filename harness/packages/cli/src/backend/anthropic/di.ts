import { ServiceCollection, createInstanceDescriptor } from '@gitlab/needle';
import { DefaultWorkflowTokenService } from '@gitlab-org/workflow-executor';
import { DefaultOSContextProvider } from '@gitlab-org/ai-context/node';
import { CliApiService } from '../../cli_api_service';
import { AnthropicParsedOptions } from './anthropic_parsed_options';
import { AnthropicBackendFactory } from './anthropic_backend_factory';
import { AnthropicModelManager } from './anthropic_model_manager';
import { NoopSessionDataService } from './noop_session_data_service';
import { WorkflowTools } from './tools';
import { UserContextProvider } from './system_context/user_context';
import { GitLabInstanceContextProvider } from './system_context/gitlab_instance_context';

/**
 * Registers the Anthropic backend factory and all Anthropic-specific services.
 *
 * @param serviceCollection - The service collection to register services with
 * @param backendOpts - The parsed Anthropic-specific options
 */
export function registerAnthropicServices(
  serviceCollection: ServiceCollection,
  backendOpts: AnthropicParsedOptions,
): void {
  // Register AnthropicParsedOptions for DI injection
  serviceCollection.add(
    createInstanceDescriptor({
      instance: backendOpts,
      aliases: [AnthropicParsedOptions],
    }),
  );

  serviceCollection.addClass(AnthropicModelManager);
  serviceCollection.addClass(AnthropicBackendFactory, WorkflowTools);
  serviceCollection.addClass(NoopSessionDataService);
  serviceCollection.addClass(CliApiService);
  serviceCollection.addClass(UserContextProvider, GitLabInstanceContextProvider);
  serviceCollection.addClass(DefaultOSContextProvider);

  serviceCollection.addClass(DefaultWorkflowTokenService);
}
