import { setActivePinia, createPinia } from 'pinia';
import { WorkflowFilter, WorkflowType } from '@gitlab-lsp/workflow-api';
import { defaultSlashCommands } from '../common/slash_commands.ts';
import {
  mockMessageBusBridge,
  mockWorkflowStoreEvents,
} from '../../test_utils/mock_workflow_store_plugin';
import { CHAT_MODE, FLOW_MODE } from '../constants.ts';
import { useMainStore } from './main';
import { useHealthCheckStore } from './health_check';

describe('Main Store', () => {
  let mainStore;
  let healthStore;

  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);

    mainStore = useMainStore();
    healthStore = useHealthCheckStore();
    healthStore.setProjectValid = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('log', () => {
    it('sends to logToOutputChannel request with the provided message', () => {
      const payload = { message: 'test message', level: 'warn' };

      mainStore.log(payload);
      expect(mockMessageBusBridge.logToOutputChannel).toHaveBeenCalledWith(payload);
    });
  });

  describe('getNamespacePath', () => {
    it('sends the getNamespacePath event', () => {
      mainStore.getNamespacePath();

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('getNamespacePath');
    });
  });

  describe('setProjectPath', () => {
    it('sets the projectPath value', () => {
      mainStore.setProjectPath('test-project');
      expect(mainStore.projectPath).toBe('test-project');
    });

    describe('when no path is provided', () => {
      beforeEach(() => {
        mainStore.setProjectPath(null);
      });

      it('calls setProjectValid with false', () => {
        expect(healthStore.setProjectValid).toHaveBeenCalledWith(false);
      });
    });

    describe('when a path is provided', () => {
      beforeEach(() => {
        mainStore.setProjectPath('/path/to/project');
      });

      it('does not call setProjectValid', () => {
        expect(healthStore.setProjectValid).not.toHaveBeenCalled();
      });
    });
  });

  describe('notifyAppReady', () => {
    it('sends the correct requests', () => {
      mainStore.notifyAppReady();
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('appReady');
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('webviewReady');
    });
  });

  describe('openUrl', () => {
    it('sends openUrl request with the provided URL', () => {
      const testUrl = 'https://example.com';
      mainStore.openUrl(testUrl);
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('openUrl', {
        url: testUrl,
      });
    });
  });

  describe('copyCodeSnippet', () => {
    it('sends copyCodeSnippet request with the provided snippet', () => {
      const snippet = 'hello';
      mainStore.copyCodeSnippet(snippet);
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('copyCodeSnippet', {
        snippet,
      });
    });
  });

  describe('copyText', () => {
    it('sends copyText notification with the provided snippet', () => {
      const text = 'hello';
      mainStore.copyText(text);
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('copyText', { text });
    });
  });

  describe('insertCodeSnippet', () => {
    it('sends insertCodeSnippet request with the provided snippet', () => {
      const snippet = 'hello';
      mainStore.insertCodeSnippet(snippet);
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('insertCodeSnippet', {
        snippet,
      });
    });
  });

  describe('copyMessage', () => {
    it('sends copyMessage request with the provided message', () => {
      const message = 'One morning, when Gregor Samsa woke from troubled dreams';
      mainStore.copyMessage(message);
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('copyMessage', {
        message,
      });
    });
  });

  describe('openFile', () => {
    it('sends openFile request with the provided path', () => {
      const testPath = '/path/to/file.js';
      mainStore.openFile(testPath);
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('openFile', {
        filePath: testPath,
      });
    });
  });

  describe('trackFeedback', () => {
    it('sends trackFeedback request', () => {
      const event = {
        didWhat: 'did',
        improveWhat: 'improve',
        feedbackChoices: ['abuse'],
      };

      mainStore.trackFeedback(event);

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('trackFeedback', event);
    });
  });

  describe('trackEvent', () => {
    it('sends trackEvent request', () => {
      const payload = {
        event: 'workflow_stop',
        context: { reason: 'navigation', workflowId: 'workflow-123' },
      };
      mainStore.trackEvent(payload);

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('trackEvent', payload);
    });
  });

  describe('slashCommands', () => {
    it('returns defaultSlashCommands array', () => {
      expect(mainStore.slashCommands).toEqual(defaultSlashCommands);
    });
  });

  describe('setMode', () => {
    describe('when a valid mode is provided', () => {
      it.each([CHAT_MODE, FLOW_MODE])('sets mode to %s', (mode) => {
        mainStore.setMode(mode);
        expect(mainStore.mode).toBe(mode);
        expect(mockMessageBusBridge.logToOutputChannel).not.toHaveBeenCalled();
      });
    });

    describe(' when an invalid mode is provided', () => {
      beforeEach(() => {
        mainStore.setMode('invalid-mode');
      });

      it('does not set mode', () => {
        expect(mainStore.mode).toBe(mainStore.mode);
      });

      it('logs a warning ', () => {
        expect(mockMessageBusBridge.logToOutputChannel).toHaveBeenCalledWith({
          message: 'Passed unsupported mode of invalid-mode. Action has been ignored',
          level: 'warning',
        });
      });
    });
  });

  describe('getters', () => {
    describe('when mode is CHAT_MODE', () => {
      beforeEach(() => {
        mainStore.setMode(CHAT_MODE);
      });

      it('isFlowTab returns false', () => {
        expect(mainStore.isFlowTab).toBe(false);
      });

      it('workflowType returns WorkflowType.CHAT', () => {
        expect(mainStore.workflowType).toBe(WorkflowType.CHAT);
      });

      it('workflowFilter returns WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS', () => {
        expect(mainStore.workflowFilter).toBe(WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS);
      });
    });

    describe('when mode is FLOW_MODE', () => {
      beforeEach(() => {
        mainStore.setMode(FLOW_MODE);
      });

      it('isFlowTab returns true', () => {
        expect(mainStore.isFlowTab).toBe(true);
      });

      it('workflowType returns WorkflowType.SOFTWARE_DEVELOPMENT', () => {
        expect(mainStore.workflowType).toBe(WorkflowType.SOFTWARE_DEVELOPMENT);
      });

      it('workflowFilter returns WorkflowType.SOFTWARE_DEVELOPMENT', () => {
        expect(mainStore.workflowFilter).toBe(WorkflowType.SOFTWARE_DEVELOPMENT);
      });
    });
  });
});
