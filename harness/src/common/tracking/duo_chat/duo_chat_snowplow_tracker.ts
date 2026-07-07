import { SelfDescribingJson, StructuredEvent } from '@snowplow/tracker-core';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { pickBy } from 'lodash';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import {
  DUO_CHAT_EVENT,
  DUO_CHAT_CATEGORY,
  DuoChatContext,
  DuoChatSnowplowTracker,
  isTrackFeedbackContext,
  SnowplowService,
  SAAS_INSTANCE_URL,
  ISnowplowClientContext,
  IClientContext,
  StandardContext,
  StandardContextSchema,
  IdeExtensionContextSchema,
  buildSnowplowClientContextData,
  createSnowplowClientContext,
} from '@gitlab-org/telemetry';

@Injectable(DuoChatSnowplowTracker, [ConfigService, SnowplowService, StandardContext, Logger])
export class DefaultDuoChatSnowplowTracker implements DuoChatSnowplowTracker {
  #snowplowService: SnowplowService;

  #configService: ConfigService;

  #standardContext: StandardContext;

  #logger: Logger;

  #options = {
    enabled: true,
    baseUrl: SAAS_INSTANCE_URL,
  };

  #clientContext: ISnowplowClientContext = createSnowplowClientContext();

  constructor(
    configService: ConfigService,
    snowplowService: SnowplowService,
    standardContext: StandardContext,
    logger: Logger,
  ) {
    this.#configService = configService;
    this.#configService.onConfigChange((config) => this.#reconfigure(config));
    this.#snowplowService = snowplowService;
    this.#standardContext = standardContext;
    this.#logger = withPrefix(logger, '[DuoChatTelemetry]');
  }

  isEnabled(): boolean {
    return this.#options.enabled;
  }

  async #reconfigure(config: ClientConfig) {
    const { baseUrl } = config;
    const enabled = config.telemetry?.enabled;

    if (typeof enabled !== 'undefined' && this.#options.enabled !== enabled) {
      this.#options.enabled = enabled;

      if (enabled === false) {
        this.#logger.warn(
          `Telemetry is disabled. Please, consider enabling telemetry to improve our service.`,
        );
      } else if (enabled === true) {
        this.#logger.info(`Telemetry is enabled.`);
      }
    }

    if (baseUrl) {
      this.#options.baseUrl = baseUrl;
    }

    this.#setClientContext({
      extension: config.telemetry?.extension,
      ide: config.telemetry?.ide,
    });
  }

  #setClientContext(context: IClientContext) {
    this.#clientContext.data = buildSnowplowClientContextData(context);
  }

  async trackEvent(event: DUO_CHAT_EVENT, context: DuoChatContext) {
    const structuredEvent: StructuredEvent | null = this.#buildStructuredEvent(event, context);

    if (!structuredEvent) {
      return;
    }

    try {
      const standardContext = this.#buildStandardContext(context);
      if (!standardContext) {
        return;
      }

      const contexts: SelfDescribingJson[] = [standardContext, this.#clientContext];

      const standardContextValid = this.#snowplowService.validateContext(
        StandardContextSchema,
        standardContext.data,
      );

      if (!standardContextValid) {
        return;
      }

      const ideExtensionContextValid = this.#snowplowService.validateContext(
        IdeExtensionContextSchema,
        this.#clientContext?.data,
      );

      if (!ideExtensionContextValid) {
        return;
      }

      await this.#snowplowService.trackStructuredEvent(structuredEvent, contexts);
    } catch (error) {
      this.#logger.warn(`Failed to track telemetry event: ${event}`, error);
    }
  }

  #buildStructuredEvent(event: DUO_CHAT_EVENT, context: DuoChatContext): StructuredEvent | null {
    if (isTrackFeedbackContext(context)) {
      const { didWhat, improveWhat, feedbackChoices } = context;

      const hasFeedback =
        Boolean(didWhat) || Boolean(improveWhat) || Boolean(feedbackChoices?.length);
      if (!hasFeedback) return null;

      return {
        category: DUO_CHAT_CATEGORY,
        action: event,
        label: 'response_feedback',
        property: context.feedbackChoices?.join(','),
      };
    }

    if (event === DUO_CHAT_EVENT.TERMINAL_ACTION_CLICKED) {
      return {
        category: DUO_CHAT_CATEGORY,
        action: event,
        label: 'explain_terminal_output',
      };
    }

    return null;
  }

  #buildStandardContext(context: DuoChatContext): SelfDescribingJson | null {
    if (isTrackFeedbackContext(context)) {
      const { improveWhat, didWhat } = context;

      const extra = pickBy({ improveWhat, didWhat }, (value): value is string => Boolean(value));

      return this.#standardContext.build(extra);
    }

    // Handle terminalActionClicked event context
    if (Object.keys(context).length === 0) {
      return this.#standardContext.build({});
    }

    return null;
  }
}
