import { Injectable } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import {
  ExtensionActivitySnowplowTracker,
  EXTENSION_ACTIVITY_CATEGORY,
  EXTENSION_ACTIVITY_EVENT,
  ExtensionActivityContext,
} from '../trackers/extension_activity_tracker';
import { DefaultSnowplowTracker } from '../default_snowplow_tracker';
import { SnowplowService, StandardContext } from '../snowplow';
import { SnowplowTracker } from '../service';

@Injectable(ExtensionActivitySnowplowTracker, [
  ConfigService,
  SnowplowService,
  StandardContext,
  Logger,
])
export class DefaultExtensionActivitySnowplowTracker implements ExtensionActivitySnowplowTracker {
  readonly #snowplowTracker: SnowplowTracker<
    EXTENSION_ACTIVITY_EVENT,
    ExtensionActivityContext,
    null
  >;

  constructor(
    configService: ConfigService,
    snowplowService: SnowplowService,
    standardContext: StandardContext,
    logger: Logger,
  ) {
    this.#snowplowTracker = new DefaultSnowplowTracker(
      configService,
      snowplowService,
      standardContext,
      logger,
      EXTENSION_ACTIVITY_CATEGORY,
    );
  }

  async trackEvent(
    event: EXTENSION_ACTIVITY_EVENT,
    context?: ExtensionActivityContext,
  ): Promise<void> {
    this.#snowplowTracker.trackEvent(event, context);
  }

  isEnabled(): boolean {
    return this.#snowplowTracker.isEnabled();
  }

  hasClientContext(): boolean {
    return this.#snowplowTracker.hasClientContext();
  }
}
