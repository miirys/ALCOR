import { ServiceCollection } from '@gitlab/needle';
import { DefaultOAuthClientProviderFactory } from './services/oauth_client_provider_factory';

export function registerMcpAuthProviderServices(serviceCollection: ServiceCollection) {
  serviceCollection.addClass(DefaultOAuthClientProviderFactory);
}
