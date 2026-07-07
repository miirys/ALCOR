import { Logger } from '@gitlab-org/logging';
import { UserService } from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { initUserController } from './user';

describe('UserController', () => {
  let userService: UserService;
  let logger: Logger;
  let userController: ReturnType<typeof initUserController>;

  beforeEach(() => {
    userService = createFakePartial<UserService>({
      user: {
        id: 'gid://gitlab/1/user-123',
        username: 'testuser',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
        restId: 123,
      },
    });

    logger = createFakePartial<Logger>({
      warn: jest.fn(),
      error: jest.fn(),
    });

    userController = initUserController(userService, logger);
  });

  describe('getUserInfo', () => {
    it('returns user information when available', async () => {
      const result = await userController.getUserInfo();

      expect(result).toEqual({
        eventName: 'setUserInfo',
        data: {
          id: 'gid://gitlab/1/user-123',
          username: 'testuser',
          name: 'Test User',
          avatarUrl: 'https://example.com/avatar.png',
        },
      });
    });

    it('returns null when user is not available', async () => {
      Object.defineProperty(userService, 'user', {
        get: () => undefined,
      });

      const result = await userController.getUserInfo();

      expect(result).toEqual({
        eventName: 'setUserInfo',
        data: null,
      });
      expect(logger.warn).toHaveBeenCalledWith('[User Controller] User information not available');
    });

    it('handles errors gracefully', async () => {
      Object.defineProperty(userService, 'user', {
        get: () => {
          throw new Error('Service unavailable');
        },
      });

      const result = await userController.getUserInfo();

      expect(result).toEqual({
        eventName: 'setUserInfo',
        data: null,
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[User Controller] Failed to get user info',
        expect.any(Error),
      );
    });
  });
});
