import { SelfDescribingJson, StructuredEvent } from '@snowplow/tracker-core';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import {
  TelemetryService,
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

export const QUICK_CHAT_CATEGORY = 'gitlab_quick_chat';

// this eslint violation predates the new enum naming rules
/* eslint-disable @typescript-eslint/naming-convention */
export enum QUICK_CHAT_OPEN_TRIGGER {
  BTN_CLICK = 'click_button',
  SHORTCUT = 'shortcut',
  CODE_ACTION_FIX_WITH_DUO = 'code_action_fix_with_duo',
}

export enum QUICK_CHAT_EVENT {
  MESSAGE_SENT = 'message_sent',
  CHAT_OPEN = 'open_quick_chat',
}
/* eslint-enable @typescript-eslint/naming-convention */

export interface QuickChatContext {
  trigger: QUICK_CHAT_OPEN_TRIGGER;
  message: string;
}

export interface QuickChatSnowplowTracker
  extends TelemetryService<QUICK_CHAT_EVENT, QuickChatContext, null> {}
export const QuickChatSnowplowTracker = createInterfaceId<QuickChatSnowplowTracker>(
  'SnowplowQuickChatTracker',
);
@Injectable(QuickChatSnowplowTracker, [ConfigService, SnowplowService, StandardContext, Logger])
export class DefaultQuickChatSnowplowTracker implements QuickChatSnowplowTracker {
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
    this.#logger = withPrefix(logger, '[QuickChatSnowplowTelemetry]');
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
          `Quick Chat Telemetry is disabled. Please, consider enabling telemetry to improve our service.`,
        );
      } else if (enabled === true) {
        this.#logger.info(`Quick Chat Telemetry is enabled.`);
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

  async trackEvent(event: QUICK_CHAT_EVENT, context: QuickChatContext) {
    const { action, label } = this.#getEventContext(event, context) ?? {};

    if (!action || !label) return;

    const structuredEvent: StructuredEvent = {
      category: QUICK_CHAT_CATEGORY,
      action,
      label,
    };

    try {
      const standardContext = this.#standardContext.build();
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
      this.#logger.warn(`Quick Chat telemetry: Failed to track telemetry event: ${action}`, error);
    }
  }

  #getEventContext(
    event: QUICK_CHAT_EVENT,
    context: QuickChatContext,
  ): { action: string; label?: string } | undefined {
    if (event === QUICK_CHAT_EVENT.MESSAGE_SENT) {
      return {
        action: event,
        label: getMessageSentEventLabel(context.message),
      };
    }
    if (event === QUICK_CHAT_EVENT.CHAT_OPEN) {
      return {
        action: event,
        label: context.trigger,
      };
    }

    return undefined;
  }
}

export function getMessageSentEventLabel(message: string) {
  const prefix = message.split(' ')[0];
  if (['/explain', '/refactor', '/fix', '/tests'].includes(prefix)) return prefix;
  if (['/reset', '/clear', '/clean'].includes(prefix)) return undefined;
  return 'general_message';
}
