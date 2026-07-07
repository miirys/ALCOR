import { Injectable } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { type AIContextItem, SystemContextProvider } from '../../index';
import { BaseOSContextProvider, type OSInfo } from './base_os';

export type { OSInfo };

@Injectable(SystemContextProvider, [Logger])
export class DefaultOSContextProvider extends BaseOSContextProvider {
  constructor(logger: Logger) {
    super(logger, '[OSContextProvider]');
  }

  async getItems(): Promise<AIContextItem[]> {
    try {
      const osInfo = this.detectOSInfo();

      if (!osInfo) {
        this.logger.info('No OS information detected');
        return [];
      }

      return [
        {
          category: 'agent_user_environment',
          content: JSON.stringify(osInfo),
          id: 'agent_user_environment_os_info',
          metadata: {
            title: 'Operating System',
            enabled: true,
            subType: 'os',
            icon: 'monitor',
            secondaryText: this.buildOSInfoContent(osInfo),
            subTypeLabel: 'System Information',
          },
        },
      ];
    } catch (error) {
      this.logger.warn('Could not detect OS information', error);
      return [];
    }
  }
}
