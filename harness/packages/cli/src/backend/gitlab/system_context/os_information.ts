import { Injectable } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { type AIContextItem, SystemContextProvider } from '@gitlab-org/ai-context';
import { BaseOSContextProvider, type OSInfo } from '@gitlab-org/ai-context/node';

@Injectable(SystemContextProvider, [Logger])
export class OSInformationContextProvider extends BaseOSContextProvider {
  constructor(logger: Logger) {
    super(logger, '[OSInformationContextProvider]');
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
          category: 'os_information',
          content: this.#buildXMLContent(osInfo),
          id: 'os_information',
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

  #buildXMLContent(osInfo: OSInfo): string {
    return `<os><platform>${osInfo.platform}</platform><architecture>${osInfo.architecture}</architecture></os>`;
  }
}
