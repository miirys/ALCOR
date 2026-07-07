import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { RpcMessageSender } from '@gitlab-org/rpc-client';
import { WorkflowUrlOpenerService } from '@gitlab-org/ai-configuration';
import { showDocumentRequest } from './workflow_rpc_messages';

@Injectable(WorkflowUrlOpenerService, [Logger, RpcMessageSender])
export class DefaultDesktopWorkflowUrlOpenerService implements WorkflowUrlOpenerService {
  #logger: Logger;

  #messageSender: RpcMessageSender;

  constructor(logger: Logger, rpcMessageSender: RpcMessageSender) {
    this.#logger = withPrefix(logger, '[DesktopWorkflowUrlOpenerService]');
    this.#messageSender = rpcMessageSender;
  }

  async openUrl(url: string): Promise<void> {
    try {
      await this.#messageSender.send(showDocumentRequest, {
        uri: url,
        external: true,
        takeFocus: true,
      });

      this.#logger.debug(`Trying to open url (${url})`);
    } catch (e) {
      this.#logger.info(`Failed to open url (${url}): ${e instanceof Error ? e.message : e}`);
    }
  }
}
