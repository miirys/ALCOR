import { z } from 'zod';
import { NO_PARAMS } from '../constants';
import { declareNotification } from './declare_notification';

describe('NotificationDeclarationBuilder', () => {
  describe('Constructor', () => {
    it('should initialize a notification with method name and default NO_PARAMS schema', () => {
      const builder = declareNotification('test/notification');
      const notification = builder.build();

      expect(notification.methodName).toBe('test/notification');
      expect(notification.type).toBe('notification');
      expect(notification.paramsSchema).toBe(NO_PARAMS);
    });
  });

  describe('withName', () => {
    it('should add a name to the notification definition', () => {
      const notification = declareNotification('test/notification')
        .withName('Test Notification')
        .build();

      expect(notification.name).toBe('Test Notification');
    });
  });

  describe('withDescription', () => {
    it('should add a description to the notification definition', () => {
      const notification = declareNotification('test/notification')
        .withDescription('This is a test notification')
        .build();

      expect(notification.description).toBe('This is a test notification');
    });
  });

  describe('withParams', () => {
    it('should update the params schema and type', () => {
      const paramsSchema = z.object({
        key: z.string(),
        value: z.number(),
      });

      const notification = declareNotification('test/notification')
        .withParams(paramsSchema)
        .build();

      expect(notification.paramsSchema).toBe(paramsSchema);
    });

    it('should support chaining of multiple method calls', () => {
      const paramsSchema = z.object({
        userId: z.string(),
        timestamp: z.number(),
      });

      const notification = declareNotification('test/notification')
        .withName('User Notification')
        .withDescription('Notification sent to a user')
        .withParams(paramsSchema)
        .build();

      expect(notification.name).toBe('User Notification');
      expect(notification.description).toBe('Notification sent to a user');
      expect(notification.paramsSchema).toBe(paramsSchema);
    });
  });

  describe('build', () => {
    it('should return a valid RpcNotificationDefinition', () => {
      const paramsSchema = z.object({
        message: z.string(),
      });

      const notification = declareNotification('test/notification')
        .withName('Test Notification')
        .withDescription('Notification for testing purposes')
        .withParams(paramsSchema)
        .build();

      expect(notification).toEqual({
        type: 'notification',
        methodName: 'test/notification',
        name: 'Test Notification',
        description: 'Notification for testing purposes',
        paramsSchema,
      });
    });

    it('should return a definition with NO_PARAMS by default', () => {
      const notification = declareNotification('test/no-params').build();

      expect(notification.paramsSchema.safeParse(undefined).success).toBe(true);
    });
  });
});
