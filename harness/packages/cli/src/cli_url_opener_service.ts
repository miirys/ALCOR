import open from 'open';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { WorkflowUrlOpenerService } from '@gitlab-org/ai-configuration';

@Injectable(WorkflowUrlOpenerService, [Logger])
export class CliUrlOpenerService implements WorkflowUrlOpenerService {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[CliUrlOpenerService]');
  }

  #validateUrl(url: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (error) {
      throw new Error(
        `Invalid URL format: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(
        `Unsupported URL scheme: ${parsed.protocol}. Only http: and https: are allowed.`,
      );
    }

    return parsed;
  }

  async openUrl(url: string): Promise<void> {
    this.#validateUrl(url);

    this.#logger.debug(`Opening URL: ${url}`);

    try {
      await open(url, { wait: false });
      this.#logger.debug(`Successfully opened URL: ${url}`);
    } catch (error) {
      throw new Error(
        `Failed to open URL (${url}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
