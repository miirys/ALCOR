import { createInterfaceId, Injectable } from '@gitlab/needle';
import { SelfDescribingJson, StructuredEvent } from '@snowplow/tracker-core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import {
  TelemetryService,
  SnowplowService,
  IClientContext,
  ISnowplowClientContext,
  StandardContext,
  StandardContextSchema,
  IdeExtensionContextSchema,
  buildSnowplowClientContextData,
  createSnowplowClientContext,
} from '@gitlab-org/telemetry';

export const SECURITY_DIAGNOSTICS_CATEGORY = 'sast_security_diagnostics';

export enum SECURITY_DIAGNOSTICS_EVENT {
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SCAN_INITIATED = 'scan_initiated',
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SCAN_RESULTS_VIEW_OPENED = 'scan_results_view_opened',
}

export interface SecurityDiagnosticsContext {
  source: string;
}

export interface SecurityDiagnosticsTracker
  extends TelemetryService<SECURITY_DIAGNOSTICS_EVENT, SecurityDiagnosticsContext, null> {}

export const SecurityDiagnosticsTracker = createInterfaceId<SecurityDiagnosticsTracker>(
  'SecurityDiagnosticsTracker',
);

@Injectable(SecurityDiagnosticsTracker, [ConfigService, SnowplowService, StandardContext, Logger])
export class DefaultSecurityDiagnosticsTracker implements SecurityDiagnosticsTracker {
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
    this.#logger = withPrefix(logger, '[SecurityDiagnosticsTracker]');
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

  async trackEvent(
    event: SECURITY_DIAGNOSTICS_EVENT,
    context?: SecurityDiagnosticsContext | undefined,
  ): Promise<void> {
    const structuredEvent: StructuredEvent = {
      category: SECURITY_DIAGNOSTICS_CATEGORY,
      action: event,
      label: context?.source,
    };
    try {
      const standardContext = this.#standardContext.build();
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
      this.#logger.debug(`Successfully tracked telemetry event: ${structuredEvent}`);
    } catch (error) {
      this.#logger.warn(
        `Failed to track telemetry event: ${SECURITY_DIAGNOSTICS_EVENT.SCAN_INITIATED}`,
        error,
      );
    }
  }

  isEnabled(): boolean {
    return this.#enabled;
  }
}
