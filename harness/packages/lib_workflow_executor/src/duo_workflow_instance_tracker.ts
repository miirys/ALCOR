import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { FixedTimeCircuitBreaker, GitLabApiService } from '@gitlab-org/core';
import { DUO_WORKFLOW_EVENT, DuoWorkflowContext, DuoWorkflowTracker } from '@gitlab-org/telemetry';
import { ConfigService } from '@gitlab-org/config';

@Injectable(DuoWorkflowTracker, [GitLabApiService, ConfigService, Logger])
export class DefaultDuoWorkflowInstanceTracker implements DuoWorkflowTracker {
  #api: GitLabApiService;

  #configService: ConfigService;

  #logger: Logger;

  #circuitBreaker = new FixedTimeCircuitBreaker();

  constructor(api: GitLabApiService, configService: ConfigService, logger: Logger) {
    this.#api = api;
    this.#configService = configService;
    this.#logger = withPrefix(logger, '[DuoWorkflowInstanceTracker]');
  }

  trackEvent(event: DUO_WORKFLOW_EVENT, context: DuoWorkflowContext): void {
    if (!this.isEnabled()) return;

    this.#trackDuoWorkflowEvent(event, context).catch((e) =>
      this.#logger.error('Could not track duo workflow telemetry event', e),
    );
  }

  async #trackDuoWorkflowEvent(eventType: DUO_WORKFLOW_EVENT, context: DuoWorkflowContext) {
    try {
      this.#logger.debug(
        `Tracking workflow event: ${eventType} for workflow ${context.workflow_id}`,
      );

      await this.#api.fetchFromApi({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/usage_data/track_event',
        body: {
          event: eventType,
          additional_properties: {
            ...context,
          },
          send_to_snowplow: true,
        },
      });

      this.#circuitBreaker.success();
    } catch (error) {
      this.#logger.error(`Telemetry request for "${eventType}" failed`, error);
      this.#circuitBreaker.error();
    }
  }

  isEnabled(): boolean {
    if (this.#circuitBreaker.isOpen()) {
      return false;
    }

    const telemetryEnabled = this.#configService.get('telemetry.enabled');
    return Boolean(telemetryEnabled);
  }
}
