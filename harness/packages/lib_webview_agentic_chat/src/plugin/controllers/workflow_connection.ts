import { Connection } from 'vscode-languageserver';
import { MessageBus } from '@gitlab-org/message-bus';
import { DuoWorkflowMessages } from '../../contract';
import {
  ControllerNoReply,
  openUrlParams,
  openFileParams,
  codeSnippetParams,
  messageParams,
  copyTextParams,
} from './types';
import { NO_REPLY } from './constants';

export type ExtensionMessageMap = {
  inbound: DuoWorkflowMessages['extensionToPlugin'];
  outbound: DuoWorkflowMessages['pluginToExtension'];
};

export const initWorkflowConnectionController = (
  connection: Connection,
  extensionMessageBus: MessageBus<ExtensionMessageMap>,
) => {
  return {
    async openUrl(payload: openUrlParams): Promise<ControllerNoReply> {
      await extensionMessageBus.sendNotification('openUrl', payload);
      return NO_REPLY;
    },
    async appReady(): Promise<ControllerNoReply> {
      await extensionMessageBus.sendNotification('appReady');
      return NO_REPLY;
    },
    async copyCodeSnippet(payload: codeSnippetParams): Promise<ControllerNoReply> {
      await extensionMessageBus.sendNotification('copyCodeSnippet', payload);
      return NO_REPLY;
    },
    async insertCodeSnippet(payload: codeSnippetParams): Promise<ControllerNoReply> {
      await extensionMessageBus.sendNotification('insertCodeSnippet', payload);
      return NO_REPLY;
    },
    async copyMessage(payload: messageParams): Promise<ControllerNoReply> {
      await extensionMessageBus.sendNotification('copyMessage', payload);
      return NO_REPLY;
    },
    async openFile(payload: openFileParams): Promise<ControllerNoReply> {
      await connection.sendNotification('$/gitlab/openFile', payload);
      return NO_REPLY;
    },
    async copyText({ text }: copyTextParams): Promise<ControllerNoReply> {
      await connection.sendNotification('$/gitlab/copyText', { text });
      return NO_REPLY;
    },
  };
};
