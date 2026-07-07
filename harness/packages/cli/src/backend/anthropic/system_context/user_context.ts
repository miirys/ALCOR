import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { type AIContextItem, SystemContextProvider } from '@gitlab-org/ai-context';

@Injectable(SystemContextProvider, [Logger])
export class UserContextProvider implements SystemContextProvider {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[UserContextProvider]');
  }

  async getItems(): Promise<AIContextItem[]> {
    try {
      return [
        {
          category: 'agent_user_environment',
          content: await this.#getUserContext(),
          id: 'cli_user_context',
          metadata: {
            title: 'User Context',
            enabled: true,
            subType: 'snippet',
            icon: 'user',
            secondaryText: 'Additional information about the CLI user',
            subTypeLabel: '',
          },
        },
      ];
    } catch (error) {
      this.#logger.warn('Could not retrieve user context', error);
      return [];
    }
  }

  async #getUserContext(): Promise<string> {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().split(' ')[0];
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return `<current_date>${currentDate} (ISO 8601 format)</current_date>
<current_time>${currentTime}</current_time>
<user_timezone>${userTimezone}</user_timezone>`;
  }
}
