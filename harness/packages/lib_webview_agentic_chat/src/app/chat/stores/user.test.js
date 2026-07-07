import { createPinia, setActivePinia } from 'pinia';
import {
  mockMessageBusBridge,
  mockWorkflowStoreEvents,
} from '../../test_utils/mock_workflow_store_plugin';
import { useUserStore } from './user';

describe('useUserStore', () => {
  let store;

  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);
    store = useUserStore();
  });

  describe('initial state', () => {
    it('initializes with isAuthenticated as true', () => {
      expect(store.isAuthenticated).toBe(true);
    });

    it('initializes with user as null', () => {
      expect(store.user).toBeNull();
    });
  });

  describe('getUserInfo', () => {
    it('sets loading state and sends request', () => {
      store.getUserInfo();

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('getUserInfo');
    });
  });

  describe('setUserInfo', () => {
    it('sets user data', () => {
      const userData = {
        id: 'user-123',
        username: 'testuser',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
      };

      store.setUserInfo(userData);

      expect(store.user).toEqual(userData);
    });
  });

  describe('setAuthenticationStatus', () => {
    it('sets isAuthenticated to true', () => {
      store.isAuthenticated = false;

      store.setAuthenticationStatus(true);

      expect(store.isAuthenticated).toBe(true);
    });

    it('sets isAuthenticated to false', () => {
      store.isAuthenticated = true;

      store.setAuthenticationStatus(false);

      expect(store.isAuthenticated).toBe(false);
    });
  });

  describe('getters', () => {
    beforeEach(() => {
      store.user = {
        id: 'user-123',
        username: 'testuser',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
      };
    });

    it('returns userAvatarUrl', () => {
      expect(store.userAvatarUrl).toBe('https://example.com/avatar.png');
    });

    it('returns userName', () => {
      expect(store.userName).toBe('Test User');
    });

    it('handles missing user data in getters', () => {
      store.user = null;

      expect(store.userAvatarUrl).toBeNull();
      expect(store.userName).toBe('Unknown User');
    });
  });
});
