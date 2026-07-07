import { HandlerNotFoundError, UnhandledHandlerError } from '../errors';
import { HashedRegistry, HashFunc } from './hashed_registry';

describe('HashedKeyHandlerRegistry', () => {
  const mockHashFunc: HashFunc<string> = jest.fn((key) => `hashed_${key}`);
  let registry: HashedRegistry<string>;

  beforeEach(() => {
    registry = new HashedRegistry<string>(mockHashFunc);
  });

  describe('register', () => {
    it('should register a handler with a hashed key', () => {
      // Arrange
      const key = 'testKey';
      const handler = jest.fn();

      // Act
      registry.register(key, handler);

      // Assert
      expect(registry.has(key)).toBe(true);
      expect(mockHashFunc).toHaveBeenCalledWith(key);
    });

    it('should unregister a handler with a hashed key when disposed', () => {
      // Arrange
      const key = 'testKey';
      const handler = jest.fn();
      const disposable = registry.register(key, handler);

      // Act
      disposable.dispose();

      // Assert
      expect(registry.has(key)).toBe(false);
    });
  });

  describe('handle', () => {
    it('should handle a registered handler with a hashed key', async () => {
      // Arrange
      const key = 'testKey';
      const handler = jest.fn().mockResolvedValue('result');
      registry.register(key, handler);

      // Act
      const result = await registry.handle(key);

      // Assert
      expect(result).toEqual('result');
      expect(handler).toHaveBeenCalled();
    });

    it('should return HandlerNotFoundError if handler with a hashed key is not found', async () => {
      // Arrange
      const key = 'unknownKey';

      // Act & Assert
      await expect(registry.handle(key)).rejects.toThrow(HandlerNotFoundError);
    });

    it('should return UnhandledHandlerError if handler with a hashed key throws an error', async () => {
      // Arrange
      const key = 'testKey';
      const error = new Error('test error');
      const handler = jest.fn().mockRejectedValue(error);
      registry.register(key, handler);

      // Act & Assert
      await expect(registry.handle(key)).rejects.toThrow(UnhandledHandlerError);
    });
  });

  describe('dispose', () => {
    it('should clear all handlers with hashed keys', () => {
      // Arrange
      const key = 'testKey';
      const handler = jest.fn();
      registry.register(key, handler);

      // Act
      registry.dispose();

      // Assert
      expect(registry.size).toBe(0);
    });
  });
});
