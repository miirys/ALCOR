import * as Sentry from '@sentry/node';
import { Injectable } from '@gitlab/needle';
import { getLanguageServerVersion } from '@gitlab-org/core';
import { SystemContext } from '@gitlab-org/request-context';
import { ConfigService } from '@gitlab-org/config';
import { ErrorTracker } from '../error_tracker';
import { SanitizedError } from '../sanitized_error';

@Injectable(ErrorTracker, [ConfigService, SystemContext])
export class NodeSentryTracker {
  #configService: ConfigService;

  #systemContext: SystemContext;

  constructor(configService: ConfigService, systemContext: SystemContext) {
    this.#configService = configService;
    this.#systemContext = systemContext;

    Sentry.init({
      dsn: 'https://e91efe8a2479ca2e503712398b6503ee@new-sentry.gitlab.net/34',
      tracesSampleRate: 1.0,
      environment: process.env.NODE_ENV,
      release: getLanguageServerVersion(),
      beforeSend: (event) => {
        return this.#isTracked(event) ? this.#prepareTrackedEvent(event) : null;
      },
      integrations: [Sentry.rewriteFramesIntegration()],
      // no breadcrumbs until we have advanced scrubbing in place to prevent private information from leaking
      maxBreadcrumbs: 0,
    });
  }

  isEnabled(): boolean {
    const enabledSetting = this.#configService.get('telemetry.enabled');
    return enabledSetting ?? false;
  }

  trackError(e: SanitizedError, additionalData?: Record<string, unknown>): void {
    if (!this.isEnabled()) return;
    Sentry.setContext('client', {
      ide: this.#systemContext.ide,
      extension: this.#systemContext.extension,
    });
    Sentry.setTag('ide.name', this.#systemContext.ide?.name || 'unknown');
    Sentry.setExtras(additionalData || {});
    // To track handled errors only to Sentry
    Sentry.setExtra('tracked', true);
    Sentry.captureException({ message: e.message });
  }

  #prepareTrackedEvent(event: Sentry.ErrorEvent) {
    const updatedEvent = { ...event };

    delete updatedEvent.extra?.tracked;

    // remove private information
    if (updatedEvent.server_name) {
      delete updatedEvent.server_name;
    }
    if (updatedEvent.contexts?.culture) {
      delete updatedEvent.contexts.culture;
    }
    if (updatedEvent.contexts?.device) {
      delete updatedEvent.contexts?.device;
    }
    if (updatedEvent.contexts?.app) {
      delete updatedEvent.contexts?.app;
    }
    return updatedEvent;
  }

  #isTracked(event: Sentry.ErrorEvent) {
    return Boolean(event.extra?.tracked);
  }

  async dispose(): Promise<void> {
    await Sentry.flush(2000);
  }
}
