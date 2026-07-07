import {
  UserPersistentStorage,
  SELECTED_CHAT_MODEL_STORAGE_KEY,
} from '@gitlab-org/persistent-storage';
import { UserService } from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ControllerResponse, ControllerNoReply } from './types';
import { NO_REPLY } from './constants';

export const initModelSelectionController = (
  storage: UserPersistentStorage,
  userService: UserService,
  logger: Logger,
) => {
  const log = withPrefix(logger, '[ModelSelectionController]');

  return {
    async persistSelectedModel({
      modelRef,
    }: {
      modelRef: string | null;
    }): Promise<ControllerNoReply> {
      try {
        await userService.getUser();
        if (modelRef) {
          await storage.set(SELECTED_CHAT_MODEL_STORAGE_KEY, modelRef);
          log.debug(`Persisted selected chat model: ${modelRef}`);
        } else {
          await storage.delete(SELECTED_CHAT_MODEL_STORAGE_KEY);
          log.debug('Cleared persisted selected chat model');
        }
      } catch (error) {
        log.error('Failed to persist selected chat model', error);
      }
      return NO_REPLY;
    },

    async getPersistedSelectedModel(): Promise<ControllerResponse> {
      try {
        await userService.getUser();
        const modelRef = await storage.get(SELECTED_CHAT_MODEL_STORAGE_KEY);
        log.debug(`Retrieved persisted selected chat model: ${modelRef ?? 'none'}`);
        return {
          eventName: 'setPersistedSelectedModel',
          data: modelRef ?? null,
        };
      } catch (error) {
        log.error('Failed to retrieve persisted selected chat model', error);
        return {
          eventName: 'setPersistedSelectedModel',
          data: null,
        };
      }
    },
  };
};
