import { Logger, withPrefix } from '@gitlab-org/logging';
import { type AIContextItem, SystemContextProvider } from '../../index';

export interface OSInfo {
  platform: string;
  architecture: string;
}

export abstract class BaseOSContextProvider implements SystemContextProvider {
  protected logger: Logger;

  constructor(logger: Logger, loggerPrefix: string) {
    this.logger = withPrefix(logger, loggerPrefix);
  }

  abstract getItems(): Promise<AIContextItem[]>;

  protected detectOSInfo(): OSInfo | null {
    try {
      const { platform, arch: architecture } = process;

      if (!platform || !architecture) {
        this.logger.debug('Platform or architecture not available');
        return null;
      }

      return {
        platform,
        architecture,
      };
    } catch (error) {
      this.logger.warn('Error detecting OS information', error);
      return null;
    }
  }

  protected buildOSInfoContent(osInfo: OSInfo): string {
    const lines: string[] = [];

    lines.push(`Platform: ${this.formatPlatform(osInfo.platform)}`);
    lines.push(`Architecture: ${osInfo.architecture}`);

    return lines.join(' • ');
  }

  protected formatPlatform(platform: string): string {
    const platformMap: Record<string, string> = {
      win32: 'Windows',
      darwin: 'macOS',
      linux: 'Linux',
      freebsd: 'FreeBSD',
      openbsd: 'OpenBSD',
      netbsd: 'NetBSD',
      aix: 'AIX',
      sunos: 'SunOS',
      android: 'Android',
    };

    return platformMap[platform] || platform;
  }
}
