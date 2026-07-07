import { Injectable } from '@gitlab/needle';
import { SelfDescribingJson, StructuredEvent } from '@snowplow/tracker-core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { SnowplowService } from '../snowplow/snowplow_service';
import { IClientContext } from '../constants';
import {
  ISnowplowClientContext,
  buildSnowplowClientContextData,
  createSnowplowClientContext,
} from '../snowplow/constants';
import { StandardContext } from '../snowplow/standard_context';
import StandardContextSchema from '../snowplow/schemas/standard_context_schema-1-1-1.json';
import * as IdeExtensionContextSchema from '../schemas/ide_extension_version-1-1-0.json';
import {
  DuoAgentPlatformTracker,
  DUO_AGENT_PLATFORM_CATEGORY,
  DuoAgentPlatformEvent,
  DuoAgentPlatformContext,
} from './duo_agent_platform_tracker';

@Injectable(DuoAgentPlatformTracker, [ConfigService, SnowplowService, StandardContext, Logger])
export class DefaultDuoAgentPlatformTracker implements DuoAgentPlatformTracker {
  #configService: ConfigService;

  #snowplowService: SnowplowService;

  #standardContext: StandardContext;

  #logger: Logger;

  #clientContext: ISnowplowClientContext = createSnowplowClientContext();

  #enabled: boolean = true;

  constructor(
    configService: ConfigService,
    snowplowService: SnowplowService,
    standardContext: StandardContext,
    logger: Logger,
  ) {
    this.#configService = configService;
    this.#snowplowService = snowplowService;
    this.#configService.onConfigChange((config) => this.#reconfigure(config));
    this.#standardContext = standardContext;
    this.#logger = withPrefix(logger, '[DuoAgentPlatformTracker]');
  }

  #reconfigure(config: ClientConfig): void {
    const enabled = config.telemetry?.enabled;

    if (typeof enabled !== 'undefined' && this.#enabled !== enabled) {
      this.#enabled = enabled;

      if (enabled === false) {
        this.#logger.warn(
          `Telemetry is disabled. Please, consider enabling telemetry to improve our service.`,
        );
      } else if (enabled === true) {
        this.#logger.info(`Telemetry is enabled.`);
      }
    }

    this.#setClientContext({
      extension: config.telemetry?.extension,
      ide: config.telemetry?.ide,
    });
  }

  #setClientContext(context: IClientContext) {
    this.#clientContext.data = buildSnowplowClientContextData(context);
  }

  async trackEvent(event: DuoAgentPlatformEvent, context?: DuoAgentPlatformContext): Promise<void> {
    const structuredEvent: StructuredEvent = {
      category: DUO_AGENT_PLATFORM_CATEGORY,
      action: event,
      value: context?.workflowId
        ? (() => {
            const parsed = parseInt(String(context.workflowId), 10);
            return Number.isFinite(parsed) ? parsed : undefined;
          })()
        : undefined,
    };
    try {
      const extra: Record<string, string> = {};

      // Using .forEach instead of for...of to work around an api-extractor bug
      // with destructuring bindings in for...of loops inside exported classes.
      Object.entries(context || {}).forEach(([key, value]) => {
        extra[key] = value;
      });

      const standardContext = this.#standardContext.build(extra);
      const contexts: SelfDescribingJson[] = [standardContext, this.#clientContext];

      const isStandardContextValid = this.#snowplowService.validateContext(
        StandardContextSchema,
        standardContext.data,
      );

      if (!isStandardContextValid) {
        return;
      }

      const isIdeExtensionContextValid = this.#snowplowService.validateContext(
        IdeExtensionContextSchema,
        this.#clientContext?.data,
      );

      if (!isIdeExtensionContextValid) {
        return;
      }

      await this.#snowplowService.trackStructuredEvent(structuredEvent, contexts);
      this.#logger.debug(`Successfully tracked telemetry event: ${structuredEvent.action}`);
    } catch (error) {
      this.#logger.warn(`Failed to track telemetry event: ${event}`, error);
    }
  }

  isEnabled(): boolean {
    return this.#enabled;
  }
}
