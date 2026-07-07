import { Cable } from '@anycable/core';
import { TestLogger } from '@gitlab-org/logging';
import { GitLabApiService } from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { AiCompletionResponseChannel } from '../api/graphql/ai_completion_response_channel';
import { ChatSubscription, ChatSubscriptionCallbacks } from './chat_subscription';

jest.useFakeTimers();

describe('ChatSubscription', () => {
  let subscription: ChatSubscription;
  let apiClient: GitLabApiService;
  let mockCable: Cable;
  let mockChannel: AiCompletionResponseChannel;
  let callbacks: ChatSubscriptionCallbacks;
  let cableEventHandlers: Record<string, (event?: { message?: string }) => void>;
  let channelEventHandlers: Record<string, (msg: unknown) => Promise<void>>;
  const logger = new TestLogger();

  beforeEach(() => {
    cableEventHandlers = {};
    channelEventHandlers = {};

    mockCable = createFakePartial<Cable>({
      subscribe: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn().mockImplementation((event: string, handler: () => void) => {
        cableEventHandlers[event] = handler;
        return () => {
          delete cableEventHandlers[event];
        };
      }),
    });

    mockChannel = createFakePartial<AiCompletionResponseChannel>({
      on: jest
        .fn()
        .mockImplementation((event: string, handler: (msg: unknown) => Promise<void>) => {
          channelEventHandlers[event] = handler;
          return () => {
            delete channelEventHandlers[event];
          };
        }),
    });

    apiClient = createFakePartial<GitLabApiService>({
      connectToCable: jest.fn().mockResolvedValue(mockCable),
    });

    callbacks = {
      onMessage: jest.fn().mockResolvedValue(undefined),
      onComplete: jest.fn(),
      isCanceled: jest.fn().mockReturnValue(false),
    };

    subscription = new ChatSubscription(apiClient, logger);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('subscribe', () => {
    it('connects to cable and subscribes to channel', async () => {
      await subscription.subscribe(mockChannel, callbacks);

      expect(apiClient.connectToCable).toHaveBeenCalled();
      expect(mockCable.subscribe).toHaveBeenCalledWith(mockChannel);
    });

    it('registers channel event listeners', async () => {
      await subscription.subscribe(mockChannel, callbacks);

      expect(mockChannel.on).toHaveBeenCalledWith('newChunk', expect.any(Function));
      expect(mockChannel.on).toHaveBeenCalledWith('fullMessage', expect.any(Function));
    });

    it('registers cable event listeners', async () => {
      await subscription.subscribe(mockChannel, callbacks);

      expect(mockCable.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockCable.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('throws error if already disposed', async () => {
      subscription.dispose();

      await expect(subscription.subscribe(mockChannel, callbacks)).rejects.toThrow(
        'ChatSubscription already disposed',
      );
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      await subscription.subscribe(mockChannel, callbacks);
    });

    it('calls onMessage callback for newChunk events', async () => {
      const chunkMsg = { requestId: 'req-1', content: 'chunk' };
      await channelEventHandlers.newChunk(chunkMsg);

      expect(callbacks.onMessage).toHaveBeenCalledWith(chunkMsg);
    });

    it('calls onMessage callback for fullMessage events', async () => {
      const fullMsg = { requestId: 'req-1', content: 'full' };
      await channelEventHandlers.fullMessage(fullMsg);

      expect(callbacks.onMessage).toHaveBeenCalledWith(fullMsg);
    });

    it('calls onComplete after fullMessage', async () => {
      const fullMsg = { requestId: 'req-1', content: 'full' };
      await channelEventHandlers.fullMessage(fullMsg);

      expect(callbacks.onComplete).toHaveBeenCalled();
    });

    it('disposes after fullMessage', async () => {
      const fullMsg = { requestId: 'req-1', content: 'full' };
      await channelEventHandlers.fullMessage(fullMsg);

      expect(subscription.isDisposed).toBe(true);
    });

    it('ignores newChunk after fullMessage received', async () => {
      const fullMsg = { requestId: 'req-1', content: 'full' };
      const chunkMsg = { requestId: 'req-1', content: 'late chunk' };

      // Save handler reference before fullMessage triggers dispose
      const newChunkHandler = channelEventHandlers.newChunk;

      await channelEventHandlers.fullMessage(fullMsg);
      jest.mocked(callbacks.onMessage).mockClear();

      // Try calling the original handler - it should check disposed state
      await newChunkHandler(chunkMsg);

      expect(callbacks.onMessage).not.toHaveBeenCalled();
    });

    it('ignores messages if canceled', async () => {
      jest.mocked(callbacks.isCanceled).mockReturnValue(true);
      const chunkMsg = { requestId: 'req-1', content: 'chunk' };

      await channelEventHandlers.newChunk(chunkMsg);

      expect(callbacks.onMessage).not.toHaveBeenCalled();
    });

    it('disposes when fullMessage is canceled', async () => {
      jest.mocked(callbacks.isCanceled).mockReturnValue(true);
      const fullMsg = { requestId: 'req-1', content: 'full' };

      await channelEventHandlers.fullMessage(fullMsg);

      expect(subscription.isDisposed).toBe(true);
      expect(callbacks.onMessage).not.toHaveBeenCalled();
    });
  });

  describe('cable events', () => {
    beforeEach(async () => {
      await subscription.subscribe(mockChannel, callbacks);
    });

    it('disposes on cable disconnect', () => {
      cableEventHandlers.disconnect({ message: 'connection lost' });

      expect(subscription.isDisposed).toBe(true);
      expect(mockCable.disconnect).toHaveBeenCalled();
    });

    it('disposes on cable close', () => {
      cableEventHandlers.close({ message: 'cable closed' });

      expect(subscription.isDisposed).toBe(true);
      expect(mockCable.disconnect).toHaveBeenCalled();
    });
  });

  describe('timeout', () => {
    it('disposes after timeout', async () => {
      await subscription.subscribe(mockChannel, callbacks);

      // Fast-forward past the 10 minute timeout
      jest.advanceTimersByTime(600_001);

      expect(subscription.isDisposed).toBe(true);
    });

    it('clears timeout on dispose', async () => {
      await subscription.subscribe(mockChannel, callbacks);
      subscription.dispose();

      // Fast-forward past what would have been the timeout
      jest.advanceTimersByTime(700_000);

      // Should not throw or cause issues - timeout was cleared
      expect(subscription.isDisposed).toBe(true);
    });
  });

  describe('dispose', () => {
    it('is idempotent - can be called multiple times safely', async () => {
      await subscription.subscribe(mockChannel, callbacks);

      subscription.dispose();
      subscription.dispose();
      subscription.dispose();

      expect(subscription.isDisposed).toBe(true);
      expect(mockCable.disconnect).toHaveBeenCalledTimes(1);
    });

    it('clears all listeners', async () => {
      await subscription.subscribe(mockChannel, callbacks);
      subscription.dispose();

      // Verify listeners were removed (handlers should be cleared)
      expect(Object.keys(cableEventHandlers)).toHaveLength(0);
      expect(Object.keys(channelEventHandlers)).toHaveLength(0);
    });

    it('disconnects the cable', async () => {
      await subscription.subscribe(mockChannel, callbacks);
      subscription.dispose();

      expect(mockCable.disconnect).toHaveBeenCalled();
    });

    it('ignores messages after dispose', async () => {
      await subscription.subscribe(mockChannel, callbacks);

      // Save handler reference before dispose clears them
      const newChunkHandler = channelEventHandlers.newChunk;

      subscription.dispose();

      // Try to call the original handler - it should check disposed state
      await newChunkHandler?.({ requestId: 'req-1', content: 'chunk' });

      expect(callbacks.onMessage).not.toHaveBeenCalled();
    });
  });

  describe('isDisposed', () => {
    it('returns false initially', () => {
      expect(subscription.isDisposed).toBe(false);
    });

    it('returns true after dispose', () => {
      subscription.dispose();
      expect(subscription.isDisposed).toBe(true);
    });
  });
});
