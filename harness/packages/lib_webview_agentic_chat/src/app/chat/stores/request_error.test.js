import { setActivePinia, createPinia } from 'pinia';
import { WorkflowStatusCode } from '@gitlab-lsp/workflow-api';
import { mockWorkflowStoreEvents } from '../../test_utils/mock_workflow_store_plugin';
import { useRequestErrorStore } from './request_error';

describe('useRequestErrorStore', () => {
  let store;

  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);
    store = useRequestErrorStore();
  });

  it('initializes with null requestError', () => {
    expect(store.requestError).toBeNull();
  });

  describe('setRequestError', () => {
    const error = 'Test error message';

    beforeEach(() => {
      store.setRequestError(error);
    });

    it('sets the requestError', () => {
      expect(store.requestError).toBe(error);
    });
  });

  describe('resetRequestError', () => {
    it('resets the requestError to null', () => {
      store.setRequestError('Test error');
      store.resetRequestError();
      expect(store.requestError).toBeNull();
    });
  });

  describe('socketError', () => {
    describe('when the error is a socket locked error', () => {
      beforeEach(() => {
        store.setRequestError({
          message: 'Socket locked',
          statusCode: WorkflowStatusCode.LOCKED_SOCKET,
        });
      });

      it('returns the error message', () => {
        expect(store.socketError).toBe('Socket locked');
      });
    });

    describe('when the error is not a socket locked error', () => {
      beforeEach(() => {
        store.setRequestError({ message: 'Some other error', statusCode: 500 });
      });

      it('returns null', () => {
        expect(store.socketError).toBeNull();
      });
    });

    describe('when there is no error', () => {
      it('returns null', () => {
        expect(store.socketError).toBeNull();
      });
    });
  });
});
