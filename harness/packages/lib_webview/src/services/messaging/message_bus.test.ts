import { MessageBus } from './message_bus';

type TestMessages = {
  test: string;
  number: number;
  complex: { value: string };
};

describe('MessageBus', () => {
  let messageBus: MessageBus<TestMessages>;

  beforeEach(() => {
    messageBus = new MessageBus<TestMessages>();
  });

  afterEach(() => {
    messageBus.dispose();
  });

  describe('subscribe', () => {
    it('should add a listener for a message type', () => {
      const listener = jest.fn();
      messageBus.subscribe('test', listener);

      expect(messageBus.hasListeners('test')).toBe(true);
      expect(messageBus.listenerCount('test')).toBe(1);
    });

    it('should support multiple listeners for the same message type', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      messageBus.subscribe('test', listener1);
      messageBus.subscribe('test', listener2);

      expect(messageBus.listenerCount('test')).toBe(2);
    });

    it('should return a disposable for unsubscribing', () => {
      const listener = jest.fn();
      const subscription = messageBus.subscribe('test', listener);

      subscription.dispose();

      expect(messageBus.hasListeners('test')).toBe(false);
      expect(messageBus.listenerCount('test')).toBe(0);
    });
  });

  describe('publish', () => {
    it('should notify all listeners of the specified message type', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const data = 'test message';

      messageBus.subscribe('test', listener1);
      messageBus.subscribe('test', listener2);

      messageBus.publish('test', data);

      expect(listener1).toHaveBeenCalledWith(data);
      expect(listener2).toHaveBeenCalledWith(data);
    });

    it('should not notify listeners of different message types', () => {
      const testListener = jest.fn();
      const numberListener = jest.fn();

      messageBus.subscribe('test', testListener);
      messageBus.subscribe('number', numberListener);

      messageBus.publish('test', 'test message');

      expect(testListener).toHaveBeenCalled();
      expect(numberListener).not.toHaveBeenCalled();
    });

    it('should handle complex message types', () => {
      const listener = jest.fn();
      const data = { value: 'test' };

      messageBus.subscribe('complex', listener);
      messageBus.publish('complex', data);

      expect(listener).toHaveBeenCalledWith(data);
    });

    it('should respect filter function when publishing', () => {
      const listener = jest.fn();
      const filter = (value: number) => value > 5;

      messageBus.subscribe('number', listener, filter);

      messageBus.publish('number', 3);
      expect(listener).not.toHaveBeenCalled();

      messageBus.publish('number', 7);
      expect(listener).toHaveBeenCalledWith(7);
    });

    it('should handle publishing when there are no listeners', () => {
      expect(() => {
        messageBus.publish('test', 'test message');
      }).not.toThrow();
    });
  });

  describe('hasListeners', () => {
    it('should return true when listeners exist', () => {
      messageBus.subscribe('test', jest.fn());
      expect(messageBus.hasListeners('test')).toBe(true);
    });

    it('should return false when no listeners exist', () => {
      expect(messageBus.hasListeners('test')).toBe(false);
    });

    it('should return false after all listeners are disposed', () => {
      const subscription1 = messageBus.subscribe('test', jest.fn());
      const subscription2 = messageBus.subscribe('test', jest.fn());

      subscription1.dispose();
      subscription2.dispose();

      expect(messageBus.hasListeners('test')).toBe(false);
    });
  });

  describe('listenerCount', () => {
    it('should return correct count of listeners', () => {
      expect(messageBus.listenerCount('test')).toBe(0);

      messageBus.subscribe('test', jest.fn());
      expect(messageBus.listenerCount('test')).toBe(1);

      messageBus.subscribe('test', jest.fn());
      expect(messageBus.listenerCount('test')).toBe(2);
    });

    it('should return 0 for message types with no listeners', () => {
      expect(messageBus.listenerCount('test')).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all listeners', () => {
      messageBus.subscribe('test', jest.fn());
      messageBus.subscribe('number', jest.fn());
      messageBus.subscribe('complex', jest.fn());

      messageBus.clear();

      expect(messageBus.hasListeners('test')).toBe(false);
      expect(messageBus.hasListeners('number')).toBe(false);
      expect(messageBus.hasListeners('complex')).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should clear all subscriptions', () => {
      const listener = jest.fn();
      messageBus.subscribe('test', listener);

      messageBus.dispose();

      expect(messageBus.hasListeners('test')).toBe(false);
      messageBus.publish('test', 'test message');
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
