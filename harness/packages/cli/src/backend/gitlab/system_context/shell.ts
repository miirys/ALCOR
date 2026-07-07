import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { AIContextItem, SystemContextProvider } from '@gitlab-org/ai-context';
import { ShellDetector, buildShellContextItems } from '@gitlab-org/ai-context/node';

@Injectable(SystemContextProvider, [Logger, ConfigService])
export class ShellContextProvider implements SystemContextProvider {
  #logger: Logger;

  #detector: ShellDetector;

  #cachedItems?: Promise<AIContextItem[]>;

  constructor(logger: Logger, configService: ConfigService) {
    this.#logger = withPrefix(logger, '[ShellContextProvider]');
    this.#detector = new ShellDetector(logger, configService);
  }

  async precalculate(): Promise<void> {
    this.#cachedItems = this.#calculateItems();

    try {
      await this.#cachedItems;
      this.#logger.info('Shell context precalculated and cached');
    } catch (error) {
      this.#logger.error('Failed to precalculate shell context', error);
    }
  }

  async getItems(): Promise<AIContextItem[]> {
    if (!this.#cachedItems) {
      this.#cachedItems = this.#calculateItems();
    }
    return this.#cachedItems;
  }

  async #calculateItems(): Promise<AIContextItem[]> {
    try {
      const shellInfo = this.#detector.detectSystemShell();

      if (!shellInfo) {
        this.#logger.info('No shell information detected');
        return [];
      }

      return buildShellContextItems(shellInfo);
    } catch (error) {
      this.#logger.warn('Could not detect shell information', error);
      return [];
    }
  }
}
