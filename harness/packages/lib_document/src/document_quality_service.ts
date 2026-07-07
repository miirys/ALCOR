/* eslint-disable max-classes-per-file */
import { Diagnostic } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  RpcMessageDefinition,
  RpcMessageDefinitionSource,
  ServerToClientRpcMessageDefinitionSource,
} from '@gitlab-org/rpc';
import { RpcMessageSender } from '@gitlab-org/rpc-client';
import { GetDiagnosticsRequest } from './types';

export interface DocumentQualityService {
  /**
   * Get diagnostics for a specific file from the IDE
   * @param fileUri - URI of the file to get diagnostics for
   * @returns Promise resolving to array of diagnostics
   */
  getDiagnostics(fileUri: URI): Promise<Diagnostic[]>;
}

export const DocumentQualityService =
  createInterfaceId<DocumentQualityService>('DocumentQualityService');

@Injectable(DocumentQualityService, [Logger, RpcMessageSender])
export class DefaultDocumentQualityService implements DocumentQualityService {
  #logger: Logger;

  #sender: RpcMessageSender;

  constructor(logger: Logger, sender: RpcMessageSender) {
    this.#logger = withPrefix(logger, '[DocumentQualityService]');
    this.#sender = sender;
  }

  async getDiagnostics(fileUri: URI): Promise<Diagnostic[]> {
    try {
      this.#logger.debug(`Getting diagnostics for file: "${fileUri}"`);

      const result = await this.#sender.send(GetDiagnosticsRequest, {
        fileUri: fileUri.toString(),
      });

      this.#logger.debug(`Received ${result.length} diagnostics for file: "${fileUri}"`);
      return result;
    } catch (error) {
      this.#logger.error(`Failed to get diagnostics for file: "${fileUri}"`, error);
      return [];
    }
  }
}

@Injectable(ServerToClientRpcMessageDefinitionSource, [])
export class DocumentQualityMessageDefinitionSource implements RpcMessageDefinitionSource {
  getMessageDefinitions(): RpcMessageDefinition[] {
    return [GetDiagnosticsRequest];
  }
}
