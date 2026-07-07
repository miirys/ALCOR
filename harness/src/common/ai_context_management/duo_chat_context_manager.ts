import { collection, Implements, ServiceLifetime, Service } from '@gitlab/needle';
import {
  AiContextTransformerService,
  DefaultChatContextManager,
  DuoChatContextManager,
} from '@gitlab-org/ai-context';
import { Logger } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { DuoFeatureAccessService } from '@gitlab-org/duo-feature-access';
import { AIContextProvider } from '.';

@Service({
  dependencies: [
    Logger,
    ConfigService,
    AiContextTransformerService,
    collection(AIContextProvider),
    DuoFeatureAccessService,
  ],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(DuoChatContextManager)
export class DefaultDuoChatContextManager extends DefaultChatContextManager {
  // This class intentionally has no implementation.
  // It exists solely as a distinct type for dependency injection purposes,
  // allowing the DI container to differentiate between duo and agentic chat
  // context managers while inheriting all behavior from the base class.
}
