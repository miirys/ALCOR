import { Injectable } from '@gitlab/needle';
import type { Meter, Tracer } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { ClientInfo, IdeInfo } from '@gitlab-org/config';
import { ConfigService } from '@gitlab-org/config';
import { OTelService, OTelServiceConfig } from '../otel_service';
import { FallibleSpanExporter } from './fallible_span_exporter';

const DEFAULT_OTLP_BASE_URL = 'https://9970.otel.gitlab-o11y.com:14318';
const DEFAULT_SERVICE_NAME = 'gitlab-lsp';
const DEFAULT_SERVICE_PROJECT_ID = '46519181';

/**
 * DI-managed Node.js OpenTelemetry implementation of {@link OTelService}.
 *
 * Provides the full Node.js OTel setup (a `NodeTracerProvider` and
 * `MeterProvider` with OTLP HTTP exporters wrapped in circuit breakers for
 * resilient export) and reads its configuration from {@link ConfigService},
 * reacting to changes via `onConfigChange`. Register with
 * `serviceCollection.addClass(DefaultNodeOTelService)`.
 *
 * The providers are constructed and held locally rather than registered as the
 * global OTel provider, to avoid clashing with other libraries (e.g. Sentry)
 * that may already own the process-global tracer/context/propagation APIs.
 *
 * For local testing instructions, see `docs/developer/opentelemetry.md`.
 */
@Injectable(OTelService, [ConfigService, Logger])
export class DefaultNodeOTelService implements OTelService {
  #tracerProvider: NodeTracerProvider | undefined;

  #meterProvider: MeterProvider | undefined;

  readonly #log: Logger;

  #enabled: boolean = false;

  #ide: IdeInfo | undefined;

  #extension: ClientInfo | undefined;

  #otlpBaseUrl: string = DEFAULT_OTLP_BASE_URL;

  #serviceName: string = DEFAULT_SERVICE_NAME;

  #serviceProjectId: string = DEFAULT_SERVICE_PROJECT_ID;

  constructor(configService: ConfigService, logger: Logger) {
    this.#log = withPrefix(logger, '[DefaultNodeOTelService]');

    // `otlpEndpoint`, `otelServiceName`, and `otelServiceProjectId` are not read
    // from ConfigService here: the defaults above are correct for the LSP's own
    // telemetry. They can be wired through `ITelemetryOptions` later if a client
    // needs to override the OTLP endpoint or service identity.
    const initial = configService.get('telemetry');
    if (initial) {
      this.setConfig({
        enabled: initial.enabled,
        ide: initial.ide,
        extension: initial.extension,
      });
    }

    configService.onConfigChange((config) => {
      const { enabled, ide, extension } = config.telemetry ?? {};
      this.setConfig({ enabled, ide, extension });
    });
  }

  setConfig(config: OTelServiceConfig): void {
    if (config.ide) this.#ide = config.ide;
    if (config.extension) this.#extension = config.extension;
    if (config.otlpEndpoint) this.#otlpBaseUrl = config.otlpEndpoint;
    if (config.otelServiceName) this.#serviceName = config.otelServiceName;
    if (config.otelServiceProjectId) this.#serviceProjectId = config.otelServiceProjectId;

    if (typeof config.enabled !== 'undefined' && this.#enabled !== config.enabled) {
      this.#enabled = config.enabled;
      if (config.enabled) {
        this.initialize().catch((error) => {
          this.#log.error(
            'Failed to initialize OpenTelemetry SDK on config change:',
            error as Error,
          );
        });
      } else {
        this.shutdown().catch((error) => {
          this.#log.error(
            'Failed to shut down OpenTelemetry SDK on config change:',
            error as Error,
          );
        });
      }
    }
  }

  isEnabled(): boolean {
    return this.#enabled;
  }

  async initialize(): Promise<void> {
    if (this.#tracerProvider) {
      this.#log.warn('OpenTelemetry SDK already initialized, skipping');
      return;
    }

    if (!this.isEnabled()) {
      this.#log.debug('Telemetry disabled, skipping OTel initialization');
      return;
    }

    try {
      const resource = new Resource({
        [ATTR_SERVICE_NAME]: this.#serviceName,
        'gitlab.project.id': this.#serviceProjectId,
        'gitlab.project.name': this.#serviceName,
        os: process.platform,
        ...(this.#ide && {
          ide_name: this.#ide.name,
          ide_vendor: this.#ide.vendor,
          ide_version: this.#ide.version,
        }),
        ...(this.#extension && {
          extension_name: this.#extension.name,
          extension_version: this.#extension.version,
        }),
      });

      const traceExporter = new FallibleSpanExporter(
        new OTLPTraceExporter({
          url: `${this.#otlpBaseUrl}/v1/traces`,
          timeoutMillis: 5000,
        }),
      );

      // We construct and hold the providers ourselves instead of using NodeSDK,
      // which registers itself as the global OTel provider. Another dependency
      // (e.g. Sentry's Node SDK) may already own the global, causing a
      // "duplicate registration" error and silently dropping our spans. Reading
      // tracers/meters directly from our own providers avoids that conflict.
      this.#tracerProvider = new NodeTracerProvider({
        resource,
        spanProcessors: [
          new BatchSpanProcessor(traceExporter, {
            maxQueueSize: 100,
            scheduledDelayMillis: 500,
            exportTimeoutMillis: 5000,
            maxExportBatchSize: 50,
          }),
        ],
      });

      // The metric reader exports once per minute, so a failed export is not
      // log-spam or load. We use the raw OTLP exporter here (no circuit breaker):
      // the breaker's backoff window is shorter than the export interval, so it
      // would almost never short-circuit a call and only adds bug surface.
      const metricExporter = new OTLPMetricExporter({
        url: `${this.#otlpBaseUrl}/v1/metrics`,
        timeoutMillis: 5000,
      });

      this.#meterProvider = new MeterProvider({
        resource,
        readers: [
          new PeriodicExportingMetricReader({
            exporter: metricExporter,
            exportIntervalMillis: 60_000,
          }),
        ],
      });

      this.#log.info(`OpenTelemetry SDK initialized (base URL: ${this.#otlpBaseUrl})`);
    } catch (error) {
      this.#log.error('Failed to initialize OpenTelemetry SDK:', error as Error);
      throw error;
    }
  }

  getTracer(name: string): Tracer | null {
    if (!this.isEnabled()) {
      return null;
    }
    return this.#tracerProvider?.getTracer(name) ?? null;
  }

  getMeter(name: string): Meter | null {
    if (!this.isEnabled()) {
      return null;
    }
    return this.#meterProvider?.getMeter(name) ?? null;
  }

  async shutdown(): Promise<void> {
    if (!this.#tracerProvider && !this.#meterProvider) {
      return;
    }
    try {
      await Promise.all([this.#tracerProvider?.shutdown(), this.#meterProvider?.shutdown()]);
      this.#tracerProvider = undefined;
      this.#meterProvider = undefined;
      this.#log.debug('OpenTelemetry SDK shutdown complete');
    } catch (error) {
      this.#log.error('Error during OpenTelemetry SDK shutdown:', error as Error);
    }
  }
}
