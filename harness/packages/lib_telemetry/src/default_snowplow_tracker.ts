import { SelfDescribingJson, StructuredEvent } from '@snowplow/tracker-core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { IClientContext } from './constants';
import {
  SnowplowService,
  ISnowplowClientContext,
  StandardContext,
  StandardContextSchema,
  buildSnowplowClientContextData,
  createSnowplowClientContext,
} from './snowplow';
import * as IdeExtensionContextSchema from './schemas/ide_extension_version-1-1-0.json';
import { SnowplowTracker } from './service';

export class DefaultSnowplowTracker<TEvent extends string, TEventContext, TTrackingContext>
  implements SnowplowTracker<TEvent, TEventContext, TTrackingContext>
{
  #configService: ConfigService;

  #snowplowService: SnowplowService;

  #standardContext: StandardContext;

  #logger: Logger;

  #eventCategory: string;

  #clientContext: ISnowplowClientContext = createSnowplowClientContext();

  #enabled: boolean = true;

  constructor(
    configService: ConfigService,
    snowplowService: SnowplowService,
    standardContext: StandardContext,
    logger: Logger,
    eventCategory: string,
  ) {
    this.#configService = configService;
    this.#snowplowService = snowplowService;
    this.#configService.onConfigChange((config) => this.#reconfigure(config));
    this.#standardContext = standardContext;
    this.#logger = withPrefix(logger, `[SnowplowTracker(${eventCategory})]`);
    this.#eventCategory = eventCategory;
  }

  #reconfigure(config: ClientConfig): void {
    const enabled = config.telemetry?.enabled;

    if (typeof enabled !== 'undefined' && this.#enabled !== enabled) {
      this.#enabled = enabled;
    }

    this.#setClientContext({
      extension: config.telemetry?.extension,
      ide: config.telemetry?.ide,
    });
  }

  #setClientContext(context: IClientContext) {
    this.#clientContext.data = buildSnowplowClientContextData(context);
  }

  async trackEvent(event: TEvent, context?: TEventContext): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    // Skip if client context not ready yet
    if (!this.hasClientContext()) {
      return;
    }

    const structuredEvent: StructuredEvent = {
      category: this.#eventCategory,
      action: event,
    };

    try {
      const extra: Record<string, string> = {};

      if (context) {
        for (const [key, value] of Object.entries(context)) {
          if (value !== null && value !== undefined) {
            extra[key] = String(value);
          }
        }
      }

      const standardContext = this.#standardContext.build(extra);
      const contexts: SelfDescribingJson[] = [standardContext, this.#clientContext];

      const isStandardContextValid = this.#snowplowService.validateContext(
        StandardContextSchema,
        standardContext.data,
      );

      if (!isStandardContextValid) {
        this.#logger.warn('Invalid standard context');
        return;
      }

      const isIdeExtensionContextValid = this.#snowplowService.validateContext(
        IdeExtensionContextSchema,
        this.#clientContext?.data,
      );

      if (!isIdeExtensionContextValid) {
        this.#logger.warn('Invalid IDE extension context');
        return;
      }

      await this.#snowplowService.trackStructuredEvent(structuredEvent, contexts);
    } catch (error) {
      this.#logger.error(`Failed to track ${event}`, error);
    }
  }

  isEnabled(): boolean {
    return this.#enabled;
  }

  hasClientContext(): boolean {
    return Boolean(this.#clientContext.data.ide_name || this.#clientContext.data.extension_name);
  }
}
