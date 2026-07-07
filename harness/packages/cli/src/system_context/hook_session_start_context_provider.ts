import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  type AIContextItem,
  SystemContextProvider,
  type WorkflowContext,
} from '@gitlab-org/ai-context';
import { HookService } from '@gitlab-org/hooks';
import { ParsedCliInput } from '../parse';

@Implements(SystemContextProvider)
@Service({
  dependencies: [Logger, HookService, ParsedCliInput],
  lifetime: ServiceLifetime.Singleton,
})
export class HookSessionStartContextProvider implements SystemContextProvider {
  #logger: Logger;

  #hookService: HookService;

  #enableProjectHooks: boolean;

  constructor(logger: Logger, hookService: HookService, cliInput: ParsedCliInput) {
    this.#logger = withPrefix(logger, '[HookSessionStartContextProvider]');
    this.#hookService = hookService;
    this.#enableProjectHooks = cliInput.enableProjectHooks;
  }

  async getItems(context?: WorkflowContext): Promise<AIContextItem[]> {
    if (!context) {
      return [];
    }

    try {
      const result = await this.#hookService.runSessionStart(
        context.sessionId,
        context.cwd,
        '',
        context.source,
        { enableProjectHooks: this.#enableProjectHooks },
      );

      if (!result.additionalContext) {
        return [];
      }

      this.#logger.info(
        `Hook returned context (${result.additionalContext.length} chars) for session ${context.sessionId}`,
      );

      return [
        {
          category: 'agent_user_environment',
          content: result.additionalContext,
          id: 'agent_user_environment_hook_session_start',
          metadata: {
            title: 'Session Start Hook Context',
            enabled: true,
            subType: 'hook',
            icon: 'hook',
            secondaryText: 'Context from SessionStart hooks',
            subTypeLabel: 'Hook',
          },
        },
      ];
    } catch (error) {
      this.#logger.warn('Failed to run SessionStart hooks', error);
      return [];
    }
  }
}
