import { Cable, ReasonError } from '@anycable/core';
import { Disposable } from '@gitlab-org/disposable';
import { Logger } from '@gitlab-org/logging';
import { GitLabApiService } from '@gitlab-org/core';
import {
  AiCompletionResponseChannel,
  AiCompletionResponseMessageType,
} from '../api/graphql/ai_completion_response_channel';
import { log } from '../log';

const RESPONSE_TIMEOUT_MS = 600_000; // 10 minutes

export type ChatSubscriptionCallbacks = {
  onMessage: (msg: AiCompletionResponseMessageType) => Promise<void>;
  onComplete: () => void;
  isCanceled: (requestId: string) => boolean;
};

/**
 * Manages a single ActionCable subscription for Duo Chat.
 *
 * Key features:
 * - Tracks and disposes all event listeners
 * - Handles cable disconnect/close events
 * - Enforces a timeout to prevent indefinitely open connections
 * - Idempotent dispose (safe to call multiple times)
 */
export class ChatSubscription implements Disposable {
  #cable: Cable | null = null;

  #listeners: { dispose: () => void }[] = [];

  #timeoutId: NodeJS.Timeout | null = null;

  #disposed = false;

  #logger: Logger;

  #client: GitLabApiService;

  constructor(client: GitLabApiService, logger: Logger) {
    this.#client = client;
    this.#logger = logger;
  }

  async subscribe(
    channel: AiCompletionResponseChannel,
    callbacks: ChatSubscriptionCallbacks,
  ): Promise<void> {
    if (this.#disposed) {
      throw new Error('ChatSubscription already disposed');
    }

    this.#cable = await this.#client.connectToCable();
    let fullMessageReceived = false;

    // Track channel listeners - store return value (Unsubscribe function)
    this.#listeners.push({
      dispose: channel.on('newChunk', async (msg) => {
        if (this.#disposed || fullMessageReceived) {
          log.info('CHAT-DEBUG: subscription disposed or full message received, ignoring chunk');
          return;
        }
        if (callbacks.isCanceled(msg.requestId)) {
          log.info('CHAT-DEBUG: stream cancelled, ignoring chunk');
          return;
        }
        try {
          await callbacks.onMessage(msg);
        } catch (error) {
          this.#logger.error('Error in onMessage callback for newChunk', error);
        }
      }),
    });

    this.#listeners.push({
      dispose: channel.on('fullMessage', async (msg) => {
        if (this.#disposed) {
          log.info('CHAT-DEBUG: subscription disposed, ignoring full message');
          return;
        }
        fullMessageReceived = true;

        if (callbacks.isCanceled(msg.requestId)) {
          log.info('CHAT-DEBUG: stream cancelled, ignoring full message');
          this.dispose();
          return;
        }

        try {
          await callbacks.onMessage(msg);
        } catch (error) {
          this.#logger.error('Error in onMessage callback for fullMessage', error);
        }

        callbacks.onComplete();
        this.dispose(); // Self-cleanup on successful completion
      }),
    });

    // Track cable-level event listeners for unexpected disconnects
    this.#listeners.push({
      dispose: this.#cable.on('disconnect', (event?: ReasonError) => {
        this.#logger.warn(`Cable disconnected unexpectedly: ${event?.message ?? 'unknown reason'}`);
        this.dispose();
      }),
    });

    this.#listeners.push({
      dispose: this.#cable.on('close', (event?: ReasonError) => {
        this.#logger.warn(`Cable closed: ${event?.message ?? 'unknown reason'}`);
        this.dispose();
      }),
    });

    // Timeout safety net - ensures cleanup even if server never responds
    this.#timeoutId = setTimeout(() => {
      this.#logger.warn('Chat subscription timeout reached, disposing');
      this.dispose();
    }, RESPONSE_TIMEOUT_MS);

    this.#cable.subscribe(channel);
    this.#logger.debug('ChatSubscription: subscribed to channel');
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;

    this.#logger.debug('ChatSubscription: disposing');

    // Clear timeout first
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId);
      this.#timeoutId = null;
    }

    // Dispose all listeners (channel and cable event handlers)
    for (const listener of this.#listeners) {
      try {
        listener.dispose();
      } catch (error) {
        this.#logger.error('Error disposing listener', error);
      }
    }
    this.#listeners = [];

    // Disconnect cable
    if (this.#cable) {
      try {
        this.#cable.disconnect();
      } catch (error) {
        this.#logger.error('Error disconnecting cable', error);
      }
      this.#cable = null;
    }
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }
}
