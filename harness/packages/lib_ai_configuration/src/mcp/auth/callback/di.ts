import { ServiceCollection } from '@gitlab/needle';
import { AuthCallbackService } from './service';

export function registerMcpAuthCallbackServices(serviceCollection: ServiceCollection) {
  serviceCollection.addClass(AuthCallbackService);
}
