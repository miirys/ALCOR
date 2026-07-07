import { Logger } from '@gitlab-org/logging';
import {
  UserPersistentStorage,
  SELECTED_CHAT_MODEL_STORAGE_KEY,
} from '@gitlab-org/persistent-storage';
import { UserService } from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { initModelSelectionController } from './model_selection';
import { NO_REPLY } from './constants';

describe('ModelSelectionController', () => {
  let storage: jest.Mocked<UserPersistentStorage>;
  let userService: jest.Mocked<Pick<UserService, 'getUser'>>;
  let logger: Logger;
  let controller: ReturnType<typeof initModelSelectionController>;

  beforeEach(() => {
    storage = createFakePartial<UserPersistentStorage>({
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    }) as jest.Mocked<UserPersistentStorage>;

    userService = createFakePartial<UserService>({
      getUser: jest.fn().mockResolvedValue({
        id: 'gid://gitlab/User/12345',
        restId: 12345,
        username: 'test-user',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
      }),
    }) as jest.Mocked<Pick<UserService, 'getUser'>>;

    logger = createFakePartial<Logger>({
      debug: jest.fn(),
      error: jest.fn(),
    });

    controller = initModelSelectionController(storage, userService as UserService, logger);
  });

  describe('persistSelectedModel', () => {
    describe('when modelRef is provided', () => {
      it('persists the model ref to storage', async () => {
        const result = await controller.persistSelectedModel({ modelRef: 'claude-3-5-sonnet' });

        expect(storage.set).toHaveBeenCalledWith(
          SELECTED_CHAT_MODEL_STORAGE_KEY,
          'claude-3-5-sonnet',
        );
        expect(result).toEqual(NO_REPLY);
      });
    });

    describe('when modelRef is null', () => {
      it('deletes the model ref from storage', async () => {
        const result = await controller.persistSelectedModel({ modelRef: null });

        expect(storage.delete).toHaveBeenCalledWith(SELECTED_CHAT_MODEL_STORAGE_KEY);
        expect(result).toEqual(NO_REPLY);
      });
    });

    describe('when storage throws an error', () => {
      beforeEach(() => {
        storage.set.mockRejectedValue(new Error('Storage error'));
      });

      it('logs the error and returns NO_REPLY', async () => {
        const result = await controller.persistSelectedModel({ modelRef: 'claude-3-5-sonnet' });

        expect(logger.error).toHaveBeenCalledWith(
          '[ModelSelectionController] Failed to persist selected chat model',
          expect.any(Error),
        );
        expect(result).toEqual(NO_REPLY);
      });
    });

    describe('when user service rejects', () => {
      beforeEach(() => {
        userService.getUser.mockRejectedValue(new Error('User fetch failed'));
      });

      it('logs the error and returns NO_REPLY', async () => {
        const result = await controller.persistSelectedModel({ modelRef: 'claude-3-5-sonnet' });

        expect(storage.set).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
          '[ModelSelectionController] Failed to persist selected chat model',
          expect.any(Error),
        );
        expect(result).toEqual(NO_REPLY);
      });
    });
  });

  describe('getPersistedSelectedModel', () => {
    describe('when a model ref is stored', () => {
      beforeEach(() => {
        storage.get.mockResolvedValue('claude-3-5-sonnet');
      });

      it('returns the persisted model ref', async () => {
        const result = await controller.getPersistedSelectedModel();

        expect(storage.get).toHaveBeenCalledWith(SELECTED_CHAT_MODEL_STORAGE_KEY);
        expect(result).toEqual({
          eventName: 'setPersistedSelectedModel',
          data: 'claude-3-5-sonnet',
        });
      });
    });

    describe('when no model ref is stored', () => {
      beforeEach(() => {
        storage.get.mockResolvedValue(undefined);
      });

      it('returns null', async () => {
        const result = await controller.getPersistedSelectedModel();

        expect(result).toEqual({
          eventName: 'setPersistedSelectedModel',
          data: null,
        });
      });
    });

    describe('when storage throws an error', () => {
      beforeEach(() => {
        storage.get.mockRejectedValue(new Error('Storage error'));
      });

      it('logs the error and returns null', async () => {
        const result = await controller.getPersistedSelectedModel();

        expect(logger.error).toHaveBeenCalledWith(
          '[ModelSelectionController] Failed to retrieve persisted selected chat model',
          expect.any(Error),
        );
        expect(result).toEqual({
          eventName: 'setPersistedSelectedModel',
          data: null,
        });
      });
    });

    describe('when user service rejects', () => {
      beforeEach(() => {
        userService.getUser.mockRejectedValue(new Error('User fetch failed'));
      });

      it('logs the error and returns null', async () => {
        const result = await controller.getPersistedSelectedModel();

        expect(storage.get).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
          '[ModelSelectionController] Failed to retrieve persisted selected chat model',
          expect.any(Error),
        );
        expect(result).toEqual({
          eventName: 'setPersistedSelectedModel',
          data: null,
        });
      });
    });
  });
});
