import { Connection } from 'vscode-languageserver';
import { MessageBus } from '@gitlab-org/message-bus';
import { createFakePartial } from '@gitlab-org/test-utils';
import { NO_REPLY } from './constants';
import { initWorkflowConnectionController, ExtensionMessageMap } from './workflow_connection';

let connectionMock: Connection;
let extensionMessageBusMock: MessageBus<ExtensionMessageMap>;

describe('WorkflowConnectionController', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let workflowConnectionController: any;

  beforeEach(() => {
    connectionMock = createFakePartial<Connection>({
      sendNotification: jest.fn(),
    });

    extensionMessageBusMock = createFakePartial<MessageBus<ExtensionMessageMap>>({
      sendNotification: jest.fn().mockResolvedValue(undefined),
    });

    workflowConnectionController = initWorkflowConnectionController(
      connectionMock,
      extensionMessageBusMock,
    );
  });

  describe('openUrl', () => {
    it('will send a notification to the extension to open the url', async () => {
      const result = await workflowConnectionController.openUrl({ url: 'test' });

      expect(extensionMessageBusMock.sendNotification).toHaveBeenCalledWith('openUrl', {
        url: 'test',
      });
      expect(result).toEqual(NO_REPLY);
    });
  });

  describe('appReady', () => {
    it('will send an appReady notification to the extension', async () => {
      const result = await workflowConnectionController.appReady();

      expect(extensionMessageBusMock.sendNotification).toHaveBeenCalledWith('appReady');
      expect(result).toEqual(NO_REPLY);
    });
  });

  describe('copyCodeSnippet', () => {
    it('will send a notification to the extension to copy the code snippet', async () => {
      const payload = { snippet: 'const x = 1;' };
      const result = await workflowConnectionController.copyCodeSnippet(payload);

      expect(extensionMessageBusMock.sendNotification).toHaveBeenCalledWith(
        'copyCodeSnippet',
        payload,
      );
      expect(result).toEqual(NO_REPLY);
    });
  });

  describe('copyText', () => {
    it('will send a notification to the extension to copy text', async () => {
      const payload = { text: 'foobar' };
      const result = await workflowConnectionController.copyText(payload);

      expect(connectionMock.sendNotification).toHaveBeenCalledWith('$/gitlab/copyText', payload);
      expect(result).toEqual(NO_REPLY);
    });
  });

  describe('insertCodeSnippet', () => {
    it('will send a notification to the extension to insert the code snippet', async () => {
      const payload = { snippet: 'const x = 1;' };
      const result = await workflowConnectionController.insertCodeSnippet(payload);

      expect(extensionMessageBusMock.sendNotification).toHaveBeenCalledWith(
        'insertCodeSnippet',
        payload,
      );
      expect(result).toEqual(NO_REPLY);
    });
  });

  describe('copyMessage', () => {
    it('will send a notification to the extension to copy the message content', async () => {
      const payload = { message: 'One morning, when Gregor Samsa woke from troubled dreams' };
      const result = await workflowConnectionController.copyMessage(payload);

      expect(extensionMessageBusMock.sendNotification).toHaveBeenCalledWith('copyMessage', payload);
      expect(result).toEqual(NO_REPLY);
    });
  });

  describe('openFile', () => {
    it('will send a notification to open the file', async () => {
      const result = await workflowConnectionController.openFile({ filePath: 'test' });

      expect(connectionMock.sendNotification).toHaveBeenCalledWith('$/gitlab/openFile', {
        filePath: 'test',
      });
      expect(result).toEqual(NO_REPLY);
    });
  });
});
