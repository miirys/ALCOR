import { Logger, TestLogger } from '@gitlab-org/logging';
import {
  DUO_CHAT_CATEGORY,
  DUO_CHAT_EVENT,
  DuoChatContext,
  SnowplowService,
  StandardContext,
} from '@gitlab-org/telemetry';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultConfigService } from '@gitlab-org/config';
import { DefaultDuoChatSnowplowTracker } from './duo_chat_snowplow_tracker';

describe('DefaultDuoChatSnowplowTracker', () => {
  let tracker: DefaultDuoChatSnowplowTracker;
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

    tracker = new DefaultDuoChatSnowplowTracker(
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

  describe('trackExplainTerminalContextEvent', () => {
    beforeEach(() => {
      jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);
    });

    it('will track event terminal action context', async () => {
      await tracker.trackEvent(DUO_CHAT_EVENT.TERMINAL_ACTION_CLICKED, {});

      expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
        {
          category: DUO_CHAT_CATEGORY,
          action: DUO_CHAT_EVENT.TERMINAL_ACTION_CLICKED,
          label: 'explain_terminal_output',
        },
        expect.any(Array),
      );
    });
  });

  describe('trackResponseFeedbackEvent', () => {
    const event: DUO_CHAT_EVENT = DUO_CHAT_EVENT.BTN_CLICK;
    const context = createFakePartial<DuoChatContext>({
      didWhat: 'Requested to improve tests.',
    });

    describe('Successful tracking', () => {
      beforeEach(() => {
        jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);
      });

      it('will track event with full feedback', async () => {
        await tracker.trackEvent(
          DUO_CHAT_EVENT.BTN_CLICK,
          createFakePartial<DuoChatContext>({
            didWhat: 'didWhat',
            improveWhat: 'improveWhat',
            feedbackChoices: ['helpful', 'fast'],
          }),
        );

        expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
          {
            category: DUO_CHAT_CATEGORY,
            action: DUO_CHAT_EVENT.BTN_CLICK,
            label: 'response_feedback',
            property: 'helpful,fast',
          },
          expect.any(Array),
        );
        expect(mockStandardContext.build).toHaveBeenCalledWith({
          didWhat: 'didWhat',
          improveWhat: 'improveWhat',
        });
      });

      it('will track event when "choices" are null', async () => {
        await tracker.trackEvent(
          DUO_CHAT_EVENT.BTN_CLICK,
          createFakePartial<DuoChatContext>({
            didWhat: 'didWhat',
            improveWhat: 'improveWhat',
            feedbackChoices: null,
          }),
        );

        expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
          {
            category: DUO_CHAT_CATEGORY,
            action: DUO_CHAT_EVENT.BTN_CLICK,
            label: 'response_feedback',
          },
          expect.any(Array),
        );
        expect(mockStandardContext.build).toHaveBeenCalledWith({
          didWhat: 'didWhat',
          improveWhat: 'improveWhat',
        });
      });

      it('will track event when free text feedback is empty', async () => {
        await tracker.trackEvent(
          DUO_CHAT_EVENT.BTN_CLICK,
          createFakePartial<DuoChatContext>({
            didWhat: undefined,
            improveWhat: undefined,
            feedbackChoices: ['helpful', 'fast'],
          }),
        );

        expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
          {
            category: DUO_CHAT_CATEGORY,
            action: DUO_CHAT_EVENT.BTN_CLICK,
            label: 'response_feedback',
            property: 'helpful,fast',
          },
          expect.any(Array),
        );
        expect(mockStandardContext.build).toHaveBeenCalledWith({});
      });
    });

    describe('Unsuccessful tracking for response feedback event', () => {
      it('will not track event when feedback is empty', async () => {
        await tracker.trackEvent(
          DUO_CHAT_EVENT.BTN_CLICK,
          createFakePartial<DuoChatContext>({
            didWhat: '',
            improveWhat: '',
            feedbackChoices: [],
          }),
        );

        expect(mockSnowplowService.trackStructuredEvent).not.toHaveBeenCalled();
        expect(mockStandardContext.build).not.toHaveBeenCalled();
      });

      it('does not track an event if the context is invalid', async () => {
        jest.mocked(mockSnowplowService.validateContext).mockReturnValue(false);
        await tracker.trackEvent(event, context);

        expect(mockSnowplowService.trackStructuredEvent).not.toHaveBeenCalled();
      });

      it('logs a warning if tracking fails', async () => {
        jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);
        (mockSnowplowService.trackStructuredEvent as jest.Mock).mockRejectedValueOnce(
          new Error('error'),
        );

        await tracker.trackEvent(
          DUO_CHAT_EVENT.BTN_CLICK,
          createFakePartial<DuoChatContext>({
            didWhat: 'didWhat',
            improveWhat: 'improveWhat',
            feedbackChoices: ['helpful', 'fast'],
          }),
        );

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining(
            '[DuoChatTelemetry] Failed to track telemetry event: click_button',
          ),
          expect.any(Error),
        );
      });
    });
  });
});
