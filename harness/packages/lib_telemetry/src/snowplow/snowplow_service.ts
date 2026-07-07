import {
  Payload,
  PayloadBuilder,
  SelfDescribingJson,
  StructuredEvent,
  buildStructEvent,
  trackerCore,
  TrackerCore,
} from '@snowplow/tracker-core';
import { v4 as uuidv4 } from 'uuid';
import Ajv, { JSONSchemaType, Schema } from 'ajv-draft-04';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { isEqual } from 'lodash-es';
import { Disposable } from '@gitlab-org/disposable';
import { LsFetch } from '@gitlab-org/fetch';
import { ConfigService } from '@gitlab-org/config';
import { Logger } from '@gitlab-org/logging';
import { GitLabApiService } from '@gitlab-org/core';
import { Emitter } from './emitter';
import {
  EVENT_VALIDATION_ERROR_MSG,
  DEFAULT_SNOWPLOW_OPTIONS,
  DEFAULT_TRACKING_ENDPOINT,
} from './constants';
import {
  supportsEventForwarding,
  supportsStandardContext,
  getEventForwarderEndpoint,
} from './event_forwarding';
import * as SnowplowMetaSchema from './schemas/snowplow_schema-1-0-0.json';

export type EnabledCallback = () => boolean;

export type SnowplowOptions = {
  appId: string;
  endpoint: string;
  timeInterval: number;
  maxItems: number;
  enabled: EnabledCallback;
  isEventForwarding: boolean;
};

/**
 * Adds the 'stm' parameter with the current time to the payload
 * Stringify all payload values
 * @param payload - The payload which will be mutated
 */
function preparePayload(payload: Payload): Record<string, string> {
  const stringifiedPayload: Record<string, string> = {};

  Object.keys(payload).forEach((key) => {
    stringifiedPayload[key] = String(payload[key]);
  });

  stringifiedPayload.stm = new Date().getTime().toString();

  return stringifiedPayload;
}

export interface SnowplowService {
  trackStructuredEvent(event: StructuredEvent, contexts: SelfDescribingJson[]): void;

  validateContext(schema: JSONSchemaType<unknown> | Schema | string, data: unknown): boolean;

  stop: () => void;

  dispose: () => void;
}

export const SnowplowService = createInterfaceId<SnowplowService>('SnowplowService');

@Injectable(SnowplowService, [LsFetch, ConfigService, GitLabApiService, Logger])
export class DefaultSnowplowService {
  /** Disable sending events when it's not possible. */
  #disabled: boolean = false;

  #emitter!: Emitter;

  #lsFetch: LsFetch;

  #logger: Logger;

  #apiService: GitLabApiService;

  #configService: ConfigService;

  #ajv = new Ajv({ strict: false });

  #options!: SnowplowOptions;

  #tracker!: TrackerCore;

  #subscriptions: Disposable[] = [];

  constructor(
    lsFetch: LsFetch,
    configService: ConfigService,
    apiService: GitLabApiService,
    logger: Logger,
  ) {
    this.#lsFetch = lsFetch;
    this.#logger = logger;
    this.#apiService = apiService;
    this.#configService = configService;
    this.#ajv.addMetaSchema(SnowplowMetaSchema);

    this.#subscriptions.push(
      configService.onConfigChange(async (config) => {
        const trackingUrl = config.telemetry?.trackingUrl;
        if (trackingUrl) {
          await this.#reconfigure({ endpoint: trackingUrl });
        }
      }),
      this.#apiService.onApiReconfigured(async (data) => {
        if (!data.isInValidState) return;
        await this.#updateEndpointBasedOnInstance();
      }),
    );

    this.#configure({
      ...DEFAULT_SNOWPLOW_OPTIONS,
      endpoint: this.#determineEndpoint(),
      isEventForwarding: this.#isEventForwardingEndpoint(),
      enabled: () => configService.get('telemetry.enabled') ?? true,
    });
  }

  #determineEndpoint(): string {
    const customTrackingUrl = this.#configService.get('telemetry.trackingUrl');
    if (customTrackingUrl) {
      return customTrackingUrl;
    }

    if (this.#apiService.instanceInfo?.instanceUrl && this.#shouldUseEventForwarding()) {
      return getEventForwarderEndpoint(this.#apiService.instanceInfo.instanceUrl);
    }

    return DEFAULT_TRACKING_ENDPOINT;
  }

  #shouldUseEventForwarding() {
    if (!this.#apiService.instanceInfo) {
      return false;
    }

    return supportsEventForwarding(
      this.#apiService.instanceInfo.instanceUrl,
      this.#apiService.instanceInfo.instanceVersion,
    );
  }

  #shouldIncludeStandardContext(): boolean {
    if (!this.#apiService.instanceInfo) {
      return false;
    }

    return supportsStandardContext(this.#apiService.instanceInfo.instanceVersion);
  }

  #isEventForwardingEndpoint(): boolean {
    const customTrackingUrl = this.#configService.get('telemetry.trackingUrl');
    if (customTrackingUrl) {
      return false;
    }

    return this.#apiService.instanceInfo ? this.#shouldUseEventForwarding() : false;
  }

  async #updateEndpointBasedOnInstance() {
    const newEndpoint = this.#determineEndpoint();
    if (newEndpoint !== this.#options.endpoint) {
      await this.#reconfigure({
        endpoint: newEndpoint,
        isEventForwarding: this.#isEventForwardingEndpoint(),
      });
    }
  }

  #configure(options: SnowplowOptions) {
    this.#options = options;
    this.#emitter = new Emitter(
      this.#options.timeInterval,
      this.#options.maxItems,
      this.#sendEvent.bind(this),
    );
    this.#emitter.start();
    this.#tracker = trackerCore({ callback: this.#emitter.add.bind(this.#emitter) });
  }

  async #reconfigure(options: Partial<SnowplowOptions>) {
    const newOptions = {
      ...this.#options,
      ...options,
    };

    if (!isEqual(this.#options, newOptions)) {
      await this.#emitter?.stop();
      this.#configure(newOptions);
    }
  }

  async trackStructuredEvent(
    event: StructuredEvent,
    context?: SelfDescribingJson[] | null,
  ): Promise<void> {
    try {
      this.#tracker.track(buildStructEvent(event), context);
    } catch (error) {
      this.#logger.warn('Failed to track Snowplow event', error);
    }
  }

  validateContext(schema: JSONSchemaType<unknown> | Schema | string, data: unknown): boolean {
    const valid = this.#ajv.validate(schema, data);
    if (!valid) {
      this.#logger.warn(EVENT_VALIDATION_ERROR_MSG);
      this.#logger.debug(
        `AJV validation issue:\nData: ${JSON.stringify(data, null, 2)}\nErrors: ${JSON.stringify(this.#ajv.errors, null, 2)}`,
      );
    }
    return valid;
  }

  async stop() {
    await this.#emitter.stop();
  }

  dispose() {
    this.#subscriptions.forEach((s) => s.dispose());
    this.#subscriptions = [];
  }

  async #sendEvent(events: PayloadBuilder[]): Promise<void> {
    if (!this.#options.enabled() || this.#disabled) {
      return;
    }

    try {
      const url = this.#options.isEventForwarding
        ? this.#options.endpoint
        : `${this.#options.endpoint}/com.snowplowanalytics.snowplow/tp2`;

      const data = {
        schema: 'iglu:com.snowplowanalytics.snowplow/payload_data/jsonschema/1-0-4',
        data: events.map((event) => {
          const eventId = uuidv4();
          // All values prefilled below are part of snowplow tracker protocol
          // https://docs.snowplow.io/docs/collecting-data/collecting-from-own-applications/snowplow-tracker-protocol/#common-parameters
          // Values are set according to either common GitLab standard:
          // tna - representing tracker namespace and being set across GitLab to "gl"
          // tv - represents tracker value, to make it aligned with downstream system it has to be prefixed with "js-*""
          // aid - represents app Id is configured via options to gitlab_ide_extension
          // eid - represents uuid for each emitted event
          event.add('eid', eventId);
          event.add('p', 'app');
          event.add('tv', 'js-gitlab');
          event.add('tna', 'gl');
          event.add('aid', this.#options.appId);

          return preparePayload(event.build());
        }),
      };
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (this.#options.isEventForwarding && this.#shouldIncludeStandardContext()) {
        headers['X-GitLab-Editor-Telemetry'] = '1';
        if (this.#apiService.tokenInfo?.token) {
          if (this.#apiService.tokenInfo.type === 'oauth') {
            headers.Authorization = `Bearer ${this.#apiService.tokenInfo.token}`;
          } else {
            headers['Private-Token'] = this.#apiService.tokenInfo.token;
          }
        }
      }

      const config = {
        headers,
        body: JSON.stringify(data),
      };

      const response = await this.#lsFetch.post(url, config);
      if (response.status !== 200) {
        this.#logger.warn(
          `Could not send telemetry to snowplow, this warning can be safely ignored. status=${response.status}`,
        );
      }
    } catch (error) {
      let errorHandled = false;

      if (typeof error === 'object' && 'errno' in (error as object)) {
        const errObject = error as object;

        // ENOTFOUND occurs when the snowplow hostname cannot be resolved.
        if ('errno' in errObject && errObject.errno === 'ENOTFOUND') {
          this.#disabled = true;
          errorHandled = true;

          this.#logger.info('Disabling telemetry, unable to resolve endpoint address.');
        } else {
          this.#logger.warn(JSON.stringify(errObject));
        }
      }

      if (!errorHandled) {
        this.#logger.warn('Failed to send telemetry event, this warning can be safely ignored');
        this.#logger.warn(JSON.stringify(error));
      }
    }
  }
}
