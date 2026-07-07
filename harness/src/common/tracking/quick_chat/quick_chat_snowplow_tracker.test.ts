import { TestLogger, Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultConfigService } from '@gitlab-org/config';
import { SnowplowService, StandardContext } from '@gitlab-org/telemetry';
import {
  DefaultQuickChatSnowplowTracker,
  QUICK_CHAT_CATEGORY,
  QUICK_CHAT_EVENT,
  QUICK_CHAT_OPEN_TRIGGER,
  QuickChatContext,
  getMessageSentEventLabel,
} from './quick_chat_snowplow_tracker';

describe('DefaultQuickChatTracker', () => {
  let tracker: DefaultQuickChatSnowplowTracker;
  let configService: DefaultConfigService;
  let mockSnowplowService: SnowplowService;
  let logger: Logger;

  let mockStandardContext: StandardContext;

  beforeEach(() => {
    configService = new DefaultConfigService();
    mockSnowplowService = createFakePartial<SnowplowService>({
      trackStructuredEvent: jest.fn(),
      validateContext: jest.fn(),
    });

    mockStandardContext = createFakePartial<StandardContext>({
      build: jest.fn().mockReturnValue({ data: {} }),
    });

    logger = new TestLogger();
    jest.spyOn(logger, 'warn');

    tracker = new DefaultQuickChatSnowplowTracker(
      configService,
      mockSnowplowService,
      mockStandardContext,
      logger,
    );
  });

  describe('isEnabled', () => {
    it('should return true by default', () => {
      expect(tracker.isEnabled()).toBe(true);
    });

    it('should return false when telemetry is disabled', () => {
      configService.set('telemetry.enabled', false);
      expect(tracker.isEnabled()).toBe(false);
    });
  });

  describe('trackEvent', () => {
    const event: QUICK_CHAT_EVENT = QUICK_CHAT_EVENT.CHAT_OPEN;
    const context = createFakePartial<QuickChatContext>({
      trigger: QUICK_CHAT_OPEN_TRIGGER.SHORTCUT,
    });

    it('does not track an event if the context is invalid', async () => {
      jest.mocked(mockSnowplowService.validateContext).mockReturnValue(false);
      await tracker.trackEvent(event, context);

      expect(mockSnowplowService.trackStructuredEvent).not.toHaveBeenCalled();
    });

    it('does not track an event if getEventContext returns undefined', async () => {
      jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);

      await tracker.trackEvent(event, context);

      expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalled();
    });

    it('logs a warning if tracking fails', async () => {
      jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);
      (mockSnowplowService.trackStructuredEvent as jest.Mock).mockRejectedValueOnce(
        new Error('error'),
      );
      await tracker.trackEvent(event, context);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Quick Chat telemetry: Failed to track telemetry event: ${event}`),
        expect.any(Error),
      );
    });

    describe('"message_sent" event', () => {
      beforeEach(() => {
        jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);
      });
      it.each`
        message                      | expectedLabel
        ${'/explain some code'}      | ${'/explain'}
        ${'/refactor this function'} | ${'/refactor'}
        ${'/fix this bug'}           | ${'/fix'}
        ${'/tests for this class'}   | ${'/tests'}
        ${'/reset the chat'}         | ${undefined}
        ${'/clear the chat'}         | ${undefined}
        ${'/clean the chat'}         | ${undefined}
        ${'some other message'}      | ${'general_message'}
      `(
        'message: "$message" will track event with label: "$expectedLabel"',
        async ({ message, expectedLabel }) => {
          await tracker.trackEvent(
            QUICK_CHAT_EVENT.MESSAGE_SENT,
            createFakePartial<QuickChatContext>({ message }),
          );
          if (expectedLabel) {
            expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
              {
                category: QUICK_CHAT_CATEGORY,
                action: QUICK_CHAT_EVENT.MESSAGE_SENT,
                label: expectedLabel,
              },
              expect.any(Array),
            );
          } else {
            expect(mockSnowplowService.trackStructuredEvent).not.toHaveBeenCalled();
          }
        },
      );
    });

    describe('"open_quick_chat" event', () => {
      beforeEach(() => {
        jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);
      });
      it.each`
        trigger
        ${QUICK_CHAT_OPEN_TRIGGER.BTN_CLICK}
        ${QUICK_CHAT_OPEN_TRIGGER.SHORTCUT}
        ${QUICK_CHAT_OPEN_TRIGGER.CODE_ACTION_FIX_WITH_DUO}
      `('will track event with label set to "$trigger"', async ({ trigger }) => {
        await tracker.trackEvent(
          QUICK_CHAT_EVENT.CHAT_OPEN,
          createFakePartial<QuickChatContext>({
            trigger,
          }),
        );

        expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
          {
            category: QUICK_CHAT_CATEGORY,
            action: QUICK_CHAT_EVENT.CHAT_OPEN,
            label: trigger,
          },
          expect.any(Array),
        );
      });
    });
  });
});

describe('getMessageSentEventLabel', () => {
  it('should return the prefix for known commands', () => {
    expect(getMessageSentEventLabel('/explain some code')).toBe('/explain');
    expect(getMessageSentEventLabel('/refactor this function')).toBe('/refactor');
    expect(getMessageSentEventLabel('/fix this bug')).toBe('/fix');
    expect(getMessageSentEventLabel('/tests for this class')).toBe('/tests');
  });

  it('should return "undefined" for reset commands', () => {
    expect(getMessageSentEventLabel('/reset')).toBeUndefined();
    expect(getMessageSentEventLabel('/clear')).toBeUndefined();
    expect(getMessageSentEventLabel('/clean')).toBeUndefined();
  });

  it('should return "general_message" for other messages', () => {
    expect(getMessageSentEventLabel('Hello, how are you?')).toBe('general_message');
    expect(getMessageSentEventLabel('Can you help me with this?')).toBe('general_message');
  });
});
