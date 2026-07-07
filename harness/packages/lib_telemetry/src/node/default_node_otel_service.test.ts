import { TestLogger } from '@gitlab-org/logging';
import { DefaultConfigService } from '@gitlab-org/config';
import { DefaultNodeOTelService } from './default_node_otel_service';

jest.mock('@opentelemetry/core', () => ({
  ExportResultCode: { SUCCESS: 0, FAILED: 1 },
}));

jest.mock('@gitlab-org/core', () => ({
  ...jest.requireActual('@gitlab-org/core'),
  ExponentialBackoffCircuitBreaker: jest.fn().mockImplementation(() => ({
    isOpen: jest.fn().mockReturnValue(false),
    error: jest.fn(),
    success: jest.fn(),
  })),
}));

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({
  OTLPMetricExporter: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@opentelemetry/sdk-metrics', () => ({
  MeterProvider: jest.fn().mockImplementation(() => ({
    getMeter: jest.fn().mockReturnValue({ createHistogram: jest.fn() }),
    shutdown: jest.fn().mockResolvedValue(undefined),
  })),
  PeriodicExportingMetricReader: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: jest.fn().mockImplementation(() => ({
    getTracer: jest.fn().mockReturnValue({ startSpan: jest.fn() }),
    shutdown: jest.fn().mockResolvedValue(undefined),
  })),
  BatchSpanProcessor: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@opentelemetry/resources', () => ({
  Resource: jest.fn().mockImplementation(() => ({})),
}));

describe('DefaultNodeOTelService', () => {
  let logger: TestLogger;
  let configService: DefaultConfigService;

  const makeService = () => new DefaultNodeOTelService(configService, logger);

  beforeEach(() => {
    logger = new TestLogger();
    configService = new DefaultConfigService();
    configService.set('telemetry.enabled', true);
  });

  describe('isEnabled', () => {
    it('reads initial enabled state from config', () => {
      expect(makeService().isEnabled()).toBe(true);
    });

    it('reads initial disabled state from config', () => {
      configService.set('telemetry.enabled', false);
      expect(makeService().isEnabled()).toBe(false);
    });

    it('reacts to config changes', () => {
      const service = makeService();
      configService.set('telemetry.enabled', false);
      expect(service.isEnabled()).toBe(false);

      configService.set('telemetry.enabled', true);
      expect(service.isEnabled()).toBe(true);
    });

    it('initializes the SDK on construction when telemetry is enabled by default', async () => {
      const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
      (NodeTracerProvider as unknown as jest.Mock).mockClear();

      // telemetry.enabled is true (set in beforeEach)
      makeService();
      await Promise.resolve();

      expect(NodeTracerProvider).toHaveBeenCalledTimes(1);
    });

    it('initializes the SDK when enabled flips from false to true via config', async () => {
      const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');

      configService.set('telemetry.enabled', false);
      makeService();
      await Promise.resolve();
      (NodeTracerProvider as unknown as jest.Mock).mockClear();

      configService.set('telemetry.enabled', true);
      await Promise.resolve();

      expect(NodeTracerProvider).toHaveBeenCalledTimes(1);
    });

    it('returns false when disabled via setConfig', () => {
      const service = makeService();
      service.setConfig({ enabled: false });
      expect(service.isEnabled()).toBe(false);
    });

    it('reacts to setConfig changes', () => {
      const service = makeService();
      service.setConfig({ enabled: false });
      expect(service.isEnabled()).toBe(false);

      service.setConfig({ enabled: true });
      expect(service.isEnabled()).toBe(true);
    });

    it('initializes the SDK when enabled flips from false to true via setConfig', async () => {
      const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');

      configService.set('telemetry.enabled', false);
      const service = makeService();
      await Promise.resolve();
      (NodeTracerProvider as unknown as jest.Mock).mockClear();

      service.setConfig({ enabled: true });
      await Promise.resolve();

      expect(NodeTracerProvider).toHaveBeenCalledTimes(1);
    });

    it('shuts down the providers when enabled flips from true to false', async () => {
      const tracerShutdown = jest.fn().mockResolvedValue(undefined);
      const meterShutdown = jest.fn().mockResolvedValue(undefined);
      const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
      const { MeterProvider } = await import('@opentelemetry/sdk-metrics');
      (NodeTracerProvider as unknown as jest.Mock).mockImplementation(() => ({
        getTracer: jest.fn().mockReturnValue({ startSpan: jest.fn() }),
        shutdown: tracerShutdown,
      }));
      (MeterProvider as unknown as jest.Mock).mockImplementation(() => ({
        getMeter: jest.fn().mockReturnValue({ createHistogram: jest.fn() }),
        shutdown: meterShutdown,
      }));

      // telemetry.enabled is true (set in beforeEach), so the constructor initializes
      const service = makeService();
      await service.initialize();

      service.setConfig({ enabled: false });
      await Promise.resolve();

      expect(tracerShutdown).toHaveBeenCalledTimes(1);
      expect(meterShutdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('initialize', () => {
    it('creates the tracer and meter providers when telemetry is enabled', async () => {
      const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
      const { MeterProvider } = await import('@opentelemetry/sdk-metrics');
      (NodeTracerProvider as unknown as jest.Mock).mockClear();
      (MeterProvider as unknown as jest.Mock).mockClear();

      // telemetry.enabled is true (set in beforeEach), so the constructor initializes
      makeService();
      await Promise.resolve();

      expect(NodeTracerProvider).toHaveBeenCalledTimes(1);
      expect(MeterProvider).toHaveBeenCalledTimes(1);
    });

    it('skips initialization when telemetry is disabled', async () => {
      const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');

      configService.set('telemetry.enabled', false);
      (NodeTracerProvider as unknown as jest.Mock).mockClear();

      const service = makeService();
      await service.initialize();

      expect(NodeTracerProvider).not.toHaveBeenCalled();
    });

    it('skips re-initialization if already initialized', async () => {
      const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');

      // telemetry.enabled is true (set in beforeEach), so the constructor initializes
      const service = makeService();
      await service.initialize();
      await service.initialize();

      expect(NodeTracerProvider).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTracer', () => {
    it('returns null when telemetry is disabled', () => {
      const service = makeService();
      service.setConfig({ enabled: false });
      expect(service.getTracer('test')).toBeNull();
    });

    it('returns null when not yet initialized', () => {
      // Construct with telemetry disabled so the constructor does not initialize.
      configService.set('telemetry.enabled', false);
      const service = makeService();
      expect(service.getTracer('test')).toBeNull();
    });

    it('returns a tracer after initialization', async () => {
      const service = makeService();
      await service.initialize();
      expect(service.getTracer('test')).not.toBeNull();
    });
  });

  describe('getMeter', () => {
    it('returns null when telemetry is disabled', () => {
      const service = makeService();
      service.setConfig({ enabled: false });
      expect(service.getMeter('test')).toBeNull();
    });

    it('returns null when not yet initialized', () => {
      // Construct with telemetry disabled so the constructor does not initialize.
      configService.set('telemetry.enabled', false);
      const service = makeService();
      expect(service.getMeter('test')).toBeNull();
    });

    it('returns a meter after initialization', async () => {
      const service = makeService();
      await service.initialize();
      expect(service.getMeter('test')).not.toBeNull();
    });
  });

  describe('shutdown', () => {
    it('shuts down the providers after initialization', async () => {
      const mockShutdown = jest.fn().mockResolvedValue(undefined);
      const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
      (NodeTracerProvider as unknown as jest.Mock).mockImplementation(() => ({
        getTracer: jest.fn().mockReturnValue({ startSpan: jest.fn() }),
        shutdown: mockShutdown,
      }));

      const service = makeService();
      await service.initialize();
      await service.shutdown();

      expect(mockShutdown).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when not initialized', async () => {
      const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');

      // Construct with telemetry disabled so the constructor does not initialize.
      configService.set('telemetry.enabled', false);
      (NodeTracerProvider as unknown as jest.Mock).mockClear();

      await expect(makeService().shutdown()).resolves.toBeUndefined();
      expect(NodeTracerProvider).not.toHaveBeenCalled();
    });
  });
});
