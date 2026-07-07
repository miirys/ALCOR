import { setActivePinia, createPinia } from 'pinia';
import {
  mockMessageBusBridge,
  mockWorkflowStoreEvents,
} from '../../test_utils/mock_workflow_store_plugin';
import { useUsageQuotaStore } from './usage_quota';
import { useRepositoriesStore } from './repositories';
import { useWorkflowStore } from './workflow';

jest.mock('./repositories', () => ({
  useRepositoriesStore: jest.fn(),
}));

jest.mock('./workflow', () => ({
  useWorkflowStore: jest.fn(),
}));

describe('useUsageQuotaStore', () => {
  let store;
  let mockRepositoriesStore;
  let mockWorkflowStore;

  beforeEach(() => {
    mockRepositoriesStore = {
      currentProject: {
        id: 'gid://gitlab/Project/1',
        namespaceWithPath: 'namespace/project',
        rootNamespaceId: 'gid://gitlab/Group/123',
        duoAgenticChatAvailable: true,
      },
      currentRootNamespaceId: 'gid://gitlab/Group/123',
    };
    jest.mocked(useRepositoriesStore).mockReturnValue(mockRepositoriesStore);

    mockWorkflowStore = {
      flowDefinition: 'chat',
    };
    jest.mocked(useWorkflowStore).mockReturnValue(mockWorkflowStore);

    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);
    store = useUsageQuotaStore();

    // Clear mock calls after store initialization
    mockMessageBusBridge.sendNotification.mockClear();
  });

  it('initializes with default state', () => {
    expect(store.usageQuotaExceeded).toBe(false);
    expect(store.usageQuotaExceededMidStream).toBe(false);
  });

  describe('checkUsageQuota', () => {
    it('sends a notification with parsed numeric rootNamespaceId and workflowDefinition', () => {
      store.checkUsageQuota();

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('checkUsageQuota', {
        rootNamespaceId: '123',
        workflowDefinition: 'chat',
      });
    });

    it('sends a notification with null rootNamespaceId when not available', () => {
      mockRepositoriesStore.currentRootNamespaceId = null;

      store.checkUsageQuota();

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('checkUsageQuota', {
        rootNamespaceId: null,
        workflowDefinition: 'chat',
      });
    });

    it('sends a notification with software_development workflow definition', () => {
      mockWorkflowStore.flowDefinition = 'software_development';

      store.checkUsageQuota();

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('checkUsageQuota', {
        rootNamespaceId: '123',
        workflowDefinition: 'software_development',
      });
    });

    it('sends a notification with custom agent workflow definition', () => {
      mockWorkflowStore.flowDefinition = 'test_agent/v1';

      store.checkUsageQuota();

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('checkUsageQuota', {
        rootNamespaceId: '123',
        workflowDefinition: 'test_agent/v1',
      });
    });
  });

  describe('setUsageQuotaExceeded', () => {
    it('updates usageQuotaExceeded', () => {
      store.setUsageQuotaExceeded({ exceeded: true });

      expect(store.usageQuotaExceeded).toBe(true);
      expect(store.usageQuotaExceededMidStream).toBe(false);
    });

    it('sets usageQuotaExceeded to false when called with false', () => {
      store.setUsageQuotaExceeded({ exceeded: false });

      expect(store.usageQuotaExceeded).toBe(false);
      expect(store.usageQuotaExceededMidStream).toBe(false);
    });

    it('sets usageQuotaExceededMidStream to true when isMidStream is true', () => {
      store.setUsageQuotaExceeded({ exceeded: true, isMidStream: true });

      expect(store.usageQuotaExceeded).toBe(true);
      expect(store.usageQuotaExceededMidStream).toBe(true);
    });
  });

  describe('resetUsageQuotaExceededMidStream', () => {
    it('resets usageQuotaExceededMidStream to false', () => {
      store.setUsageQuotaExceeded({ exceeded: true, isMidStream: true });
      expect(store.usageQuotaExceededMidStream).toBe(true);

      store.resetUsageQuotaExceededMidStream();
      expect(store.usageQuotaExceededMidStream).toBe(false);
    });
  });
});
