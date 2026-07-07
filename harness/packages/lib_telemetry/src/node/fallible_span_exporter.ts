import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { ExponentialBackoffCircuitBreaker } from '@gitlab-org/core';

export class FallibleSpanExporter implements SpanExporter {
  readonly #inner: SpanExporter;

  readonly #circuit: ExponentialBackoffCircuitBreaker;

  constructor(inner: SpanExporter) {
    this.#inner = inner;
    this.#circuit = new ExponentialBackoffCircuitBreaker();
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    if (this.#circuit.isOpen()) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }
    this.#inner.export(spans, (result) => {
      if (result.code === ExportResultCode.FAILED) {
        this.#circuit.error();
      } else {
        this.#circuit.success();
      }
      resultCallback(result);
    });
  }

  forceFlush(): Promise<void> {
    return this.#inner.forceFlush?.() ?? Promise.resolve();
  }

  shutdown(): Promise<void> {
    return this.#inner.shutdown();
  }
}
