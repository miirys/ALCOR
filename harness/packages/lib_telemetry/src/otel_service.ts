import { createInterfaceId } from '@gitlab/needle';
import type { Meter, Span, Tracer } from '@opentelemetry/api';
import type { ClientInfo, IdeInfo } from '@gitlab-org/config';

export type { Meter, Span, Tracer };

export interface OTelServiceConfig {
  enabled?: boolean;
  otlpEndpoint?: string;
  otelServiceName?: string;
  otelServiceProjectId?: string;
  ide?: IdeInfo;
  extension?: ClientInfo;
}

/**
 * Abstraction over OpenTelemetry that allows each consumer (VS Code extension,
 * CLI, language service) to provide host-specific resource attributes while
 * sharing the core tracing/metrics logic.
 */
export interface OTelService {
  /** Returns true when telemetry is enabled for the current consumer. */
  isEnabled(): boolean;
  /** Initialises the underlying OTel SDK. Must be called before getTracer/getMeter. */
  initialize(): Promise<void>;
  /** Returns a Tracer for the given instrumentation scope, or null when disabled. */
  getTracer(name: string): Tracer | null;
  /** Returns a Meter for the given instrumentation scope, or null when disabled. */
  getMeter(name: string): Meter | null;
  /** Flushes pending spans/metrics and shuts down the SDK. */
  shutdown(): Promise<void>;
  /** Updates the service configuration. Can be called multiple times. */
  setConfig(config: OTelServiceConfig): void;
}

export const OTelService = createInterfaceId<OTelService>('OTelService');
