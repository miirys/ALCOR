# OpenTelemetry in the GitLab Language Server

The Language Server uses [OpenTelemetry (OTel)](https://opentelemetry.io/) to collect
traces and metrics.

This guide explains the architecture, how to instrument new features, and how to
test OTel locally.

## Architecture

The observability layer is built around the `OTelService` interface
(`packages/lib_telemetry/src/otel_service.ts`):

- `isEnabled()` — returns whether the user has consented to telemetry.
- `initialize()` — sets up the OTel SDK and exporters.
- `getTracer(name)` — returns a `Tracer` or `null` when telemetry is disabled.
- `getMeter(name)` — returns a `Meter` or `null` when telemetry is disabled.
- `shutdown()` — flushes and tears down the SDK.
- `setConfig(config)` — updates the service configuration. Can be called multiple times.

The Node.js implementation is `DefaultNodeOTelService`
(`packages/lib_telemetry/src/node/default_node_otel_service.ts`): it initializes the
OpenTelemetry Node SDK with OTLP exporters for traces and metrics.

`DefaultNodeOTelService` is a DI-managed service (`@Injectable(OTelService, [ConfigService, Logger])`).
Register it with `serviceCollection.addClass(DefaultNodeOTelService)`. It reads the initial
telemetry configuration from `ConfigService` and reacts to changes via `onConfigChange`, so
flipping `telemetry.enabled` from `false` to `true` lazily initializes the SDK.

### Circuit breaker

`FallibleSpanExporter` (`packages/lib_telemetry/src/node/`) wraps the OTLP trace exporter
with an `ExponentialBackoffCircuitBreaker` from `@gitlab-org/core`. After an export failure
the circuit opens and further attempts are silently skipped during a backoff window (using
the breaker's defaults: starting at 1s and doubling up to a 60s cap). Once the window elapses
the next export is retried, so telemetry automatically resumes when the OTLP endpoint becomes
reachable again. This prevents indefinite error logging when the OTLP endpoint is unreachable
(for example, when it is blocked by a customer firewall) without permanently disabling
telemetry.

The metric exporter is left unwrapped, as it does not benefit from a circuit breaker: it
exports only once per minute, so a failed export logs at most one error per minute rather
than creating noisy logs.

### OTLP endpoint

By default, signals are exported to the GitLab-hosted OTLP collector. The OTLP endpoint is available on the [`editor-extensions` **Observability > Setup** page](https://gitlab.com/groups/gitlab-org/editor-extensions/-/observability/setup).

The endpoint can be overridden by passing `otlpEndpoint` through `setConfig`, which is
intended for **local testing only** and should not be set in production environments.
You can find and add dashboards for visualizing the collected signals in the [`editor-extensions` observability dashboards](https://gitlab.com/groups/gitlab-org/editor-extensions/-/observability/dashboard).

### Resource attributes

The SDK is initialized with the following resource attributes, so signals can be
filtered by client and environment in the Observability UI:

| Attribute                                 | Description                                        |
| ----------------------------------------- | -------------------------------------------------- |
| `service.name`                            | Identifies the service (for example, `gitlab-lsp`) |
| `gitlab.project.id`                       | GitLab project ID of the Language Server           |
| `gitlab.project.name`                     | Human-readable project name                        |
| `ide_name` / `ide_vendor` / `ide_version` | IDE identification                                 |
| `extension_name` / `extension_version`    | Client extension identification                    |
| `os`                                      | `process.platform` value                           |

## Instrumenting features

### Traces

Use traces to track the execution of a specific operation over time, such as a
request lifecycle or a multi-step process. Traces are made up of spans that can
be nested to show cause and effect. See the
[OTel traces documentation](https://opentelemetry.io/docs/concepts/signals/traces/) for more detail.

`getTracer()` returns `null` when telemetry is disabled, so always guard against it:

```typescript
const tracer = otelService.getTracer('gitlab-lsp.my-feature');
tracer?.startActiveSpan('my-operation', (span) => {
  try {
    // ... do work ...
    span.setAttributes({ result: 'success' });
  } catch (error) {
    span.setAttributes({ result: 'error' });
    throw error;
  } finally {
    span.end();
  }
});
```

### Metrics

Use metrics to measure aggregated values over time, such as durations, counts, or
error rates. Unlike traces, metrics are not tied to individual operations. See the
[OTel metrics documentation](https://opentelemetry.io/docs/concepts/signals/metrics/) for more detail.

`getMeter()` also returns `null` when telemetry is disabled:

```typescript
const meter = otelService.getMeter('gitlab-lsp.my-feature');
const histogram = meter?.createHistogram('operation.duration', { unit: 'ms' });

histogram?.record(Math.round(durationMs), { status: 'success' });
```

Metrics are exported on a 60-second interval by default.

## Telemetry consent

`isEnabled()` reflects the `telemetry.enabled` value from `ConfigService`, which the
client (for example, the VS Code extension) sets based on the user's telemetry consent.
When telemetry is disabled, the OTel SDK is not initialized and no data is exported —
tracing and metrics will not work until the user enables telemetry.

## Testing locally

OTel is enabled when `telemetry.enabled` is `true` in the configuration the client sends.
Make sure telemetry is enabled in your client before testing.

Override the OTLP base URL (via `setConfig`'s `otlpEndpoint`) to point at a local
collector. Then run the Language Server and trigger the instrumented code path.
Choose one of the following local collectors depending on what you need to inspect.

### Traces only — Jaeger

[Jaeger](https://www.jaegertracing.io/) is an open-source distributed tracing UI
that accepts OTLP data and lets you visualise spans in a browser.

1. Start Jaeger locally (exposes OTLP HTTP on port `4318` and the UI on port `16686`):

   ```shell
   docker run -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one
   ```

1. Point the OTLP endpoint at `http://localhost:4318`.

1. Run the Language Server and trigger the instrumented code path.

1. Open the Jaeger UI at **[http://localhost:16686](http://localhost:16686)**, select the
   `gitlab-lsp` service, and click **Find Traces**.

### Traces and metrics — Grafana LGTM

[Grafana LGTM](https://github.com/grafana/docker-otel-lgtm) is an all-in-one
Docker image that accepts OTLP for both traces and metrics, and provides a Grafana
UI to visualise them.

1. Start the Grafana LGTM container (exposes OTLP HTTP on port `4318` and Grafana
   on port `3000`):

   ```shell
   docker run -d --name grafana-lgtm -p 3000:3000 -p 4318:4318 grafana/otel-lgtm
   ```

1. Point the OTLP endpoint at `http://localhost:4318`.

1. Run the Language Server and trigger the instrumented code path.

1. Open Grafana at **[http://localhost:3000](http://localhost:3000)** (credentials: `admin` / `admin`), then review
   traces or metrics:
   - **Traces**: Explore → Tempo → select the `gitlab-lsp` service.
   - **Metrics**: Explore → Prometheus → query your metric name (for example,
     `ls_startup_duration`).

### Debug logs

Check the Language Server log for `[DefaultNodeOTelService]` prefixed log messages to
confirm initialization and export status.

## Related topics

- [Telemetry and tracking](telemetry-and-tracking.md)
- [GitLab Observability development setup](https://docs.gitlab.com/ee/development/observability/)
- [Editor extensions observability setup](https://gitlab.com/groups/gitlab-org/editor-extensions/-/observability/setup) —
  contains the OTLP endpoint configuration
- [Editor extensions observability dashboards](https://gitlab.com/groups/gitlab-org/editor-extensions/-/observability/dashboard) —
  new dashboards for traces and metrics should be added here
