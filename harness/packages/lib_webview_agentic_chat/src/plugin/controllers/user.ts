import { UserService } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import { ControllerResponse } from './types';

export const initUserController = (userService: UserService, log: Logger) => {
  return {
    async getUserInfo(): Promise<ControllerResponse> {
      try {
        const { user } = userService;
        if (!user) {
          log.warn('[User Controller] User information not available');
          return {
            eventName: 'setUserInfo',
            data: null,
          };
        }

        return {
          eventName: 'setUserInfo',
          data: {
            id: user.id,
            username: user.username,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
        };
      } catch (error) {
        log.error('[User Controller] Failed to get user info', error);
        return {
          eventName: 'setUserInfo',
          data: null,
        };
      }
    },
  };
};
