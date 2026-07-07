import { EventEmitterImpl } from './event_emitter';

describe('EventEmitterImpl', () => {
  let emitter: EventEmitterImpl<string>;

  beforeEach(() => {
    emitter = new EventEmitterImpl<string>();
  });

  it('should register a listener and fire an event', () => {
    const listener = jest.fn();
    const subscription = emitter.event(listener);

    emitter.fire('test-event');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('test-event', expect.any(AbortSignal));

    subscription.dispose();
  });

  it('should support multiple listeners', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();

    const subscription1 = emitter.event(listener1);
    const subscription2 = emitter.event(listener2);

    emitter.fire('test-event');

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);

    subscription1.dispose();
    subscription2.dispose();
  });

  it('should stop calling listener after subscription is disposed', () => {
    const listener = jest.fn();
    const subscription = emitter.event(listener);

    emitter.fire('first-event');
    subscription.dispose();
    emitter.fire('second-event');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('first-event', expect.any(AbortSignal));
    expect(listener).not.toHaveBeenCalledWith('second-event', expect.any(AbortSignal));
  });

  it('should respect thisArg parameter', () => {
    class EventHandler {
      lastEventData: string | null = null;

      handleEvent(data: string): void {
        this.lastEventData = data;
      }
    }

    const handler = new EventHandler();
    const subscription = emitter.event(handler.handleEvent, handler);

    emitter.fire('test-event');

    expect(handler.lastEventData).toBe('test-event');

    subscription.dispose();
  });

  it('should remove all listeners when dispose is called', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();

    emitter.event(listener1);
    emitter.event(listener2);

    emitter.dispose();
    emitter.fire('test-event');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('aborts signal when a new event is fired', () => {
    const listener = jest.fn();
    emitter.event(listener);

    emitter.fire('test-event');

    const firstSignal = listener.mock.calls[0][1];

    expect(firstSignal.aborted).toBe(false);

    emitter.fire('second-event');

    expect(firstSignal.aborted).toBe(true);
  });
});
