import { setActivePinia, createPinia } from 'pinia';
import {
  mockMessageBusBridge,
  mockWorkflowStoreEvents,
} from '../../test_utils/mock_workflow_store_plugin';
import { DEFAULT_DOCKER_IMAGE } from '../constants.ts';
import { useDockerStore, DOCKER_STATES } from './docker';

describe('Docker Store', () => {
  let store;

  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);
    store = useDockerStore();
  });

  it('initializes with default state', () => {
    expect(store.dockerImage).toBe(DEFAULT_DOCKER_IMAGE);
    expect(store.status).toBe(DOCKER_STATES.IMAGE_PULLED);
  });

  describe('pullDockerImageCompleted', () => {
    it('updates state correctly', () => {
      store.pullDockerImageCompleted({ success: true });
      expect(store.status).toBe(DOCKER_STATES.IMAGE_PULLED);
    });

    it('updates state on failure', () => {
      store.pullDockerImageCompleted({ success: false });
      expect(store.status).toBe(DOCKER_STATES.IMAGE_FAILED);
    });
  });

  describe('pullDockerImage', () => {
    it('sets loading state and sends request', () => {
      store.pullDockerImage();

      expect(store.status).toBe(DOCKER_STATES.PULLING_IMAGE);
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
        'pullDockerImage',
        DEFAULT_DOCKER_IMAGE,
      );
    });
  });

  describe('setDockerAvailable', () => {
    it('updates status when image needs to be pulled', () => {
      store.setDockerAvailable(false);

      expect(store.status).toBe(DOCKER_STATES.PULLING_IMAGE);
    });

    it('updates status when image is pulled', () => {
      store.setDockerAvailable(true);

      expect(store.status).toBe(DOCKER_STATES.IMAGE_PULLED);
    });
  });

  describe('verifyDockerImage', () => {
    it('sends request to verify docker image', () => {
      store.verifyDockerImage();

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
        'verifyDockerImage',
        DEFAULT_DOCKER_IMAGE,
      );
    });
  });
});
