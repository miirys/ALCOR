import {
  InitializeError,
  InitializeResult,
  RequestHandler,
  TextDocumentSyncKind,
} from 'vscode-languageserver-protocol';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { InitializeParams } from 'vscode-languageserver';
import { ConfigService } from '@gitlab-org/config';
import { getLanguageServerVersion } from '@gitlab-org/core';
import { HandlesRequest } from '../../handler';
import { IClientContext } from '../../tracking';

export type CustomInitializeParams = InitializeParams & {
  initializationOptions?: IClientContext;
};

export interface InitializeHandler
  extends HandlesRequest<CustomInitializeParams, InitializeResult, InitializeError> {}

export const InitializeHandler = createInterfaceId<InitializeHandler>('InitializeHandler');

@Injectable(InitializeHandler, [ConfigService])
export class DefaultInitializeHandler implements InitializeHandler {
  #configService: ConfigService;

  constructor(configService: ConfigService) {
    this.#configService = configService;
  }

  requestHandler: RequestHandler<CustomInitializeParams, InitializeResult, InitializeError> = (
    params: CustomInitializeParams,
  ): InitializeResult => {
    const { clientInfo, initializationOptions, workspaceFolders } = params;

    this.#configService.set('clientInfo', clientInfo);
    this.#configService.set('workspaceFolders', workspaceFolders);
    this.#configService.set('baseAssetsUrl', initializationOptions?.baseAssetsUrl);

    this.#configService.set('telemetry.ide', initializationOptions?.ide ?? clientInfo);
    this.#configService.set('telemetry.extension', initializationOptions?.extension);
    for (const [key, value] of Object.entries(initializationOptions?.featureFlagOverrides ?? {})) {
      this.#configService.set(`featureFlagOverrides.${key}`, value);
    }

    return {
      capabilities: {
        workspace: {
          workspaceFolders: {
            supported: true,
            changeNotifications: true,
          },
        },
        completionProvider: {
          resolveProvider: true,
        },
        inlineCompletionProvider: true,
        textDocumentSync: TextDocumentSyncKind.Full,
      },
      serverInfo: {
        name: 'GitLab Language Server',
        version: getLanguageServerVersion(),
      },
    };
  };
}
