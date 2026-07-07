import { ExportResultCode } from '@opentelemetry/core';
import type { ExportResult } from '@opentelemetry/core';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { FallibleSpanExporter } from './fallible_span_exporter';

jest.useFakeTimers();

const makeResult = (code: ExportResultCode): ExportResult => ({ code });
const SUCCESS = makeResult(ExportResultCode.SUCCESS);
const FAILED = makeResult(ExportResultCode.FAILED);

const DEFAULT_INITIAL_BACKOFF_MS = 1000;

const emptySpans: ReadableSpan[] = [];

function makeInnerExporter(result: ExportResult): jest.Mocked<SpanExporter> {
  return {
    export: jest.fn((_spans, cb) => cb(result)),
    forceFlush: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
  };
}

describe('FallibleSpanExporter', () => {
  describe('when exports succeed', () => {
    it('delegates to the inner exporter and returns SUCCESS', () => {
      const inner = makeInnerExporter(SUCCESS);
      const exporter = new FallibleSpanExporter(inner);
      const cb = jest.fn();

      exporter.export(emptySpans, cb);

      expect(inner.export).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(SUCCESS);
    });

    it('keeps delegating to the inner exporter while exports keep succeeding', () => {
      const inner = makeInnerExporter(SUCCESS);
      const exporter = new FallibleSpanExporter(inner);
      const cb = jest.fn();

      for (let i = 0; i < 5; i++) {
        exporter.export(emptySpans, cb);
      }

      expect(inner.export).toHaveBeenCalledTimes(5);
    });
  });

  describe('when exports fail', () => {
    it('opens the circuit after a failure and stops delegating to the inner exporter', () => {
      const inner = makeInnerExporter(FAILED);
      const exporter = new FallibleSpanExporter(inner);
      const cb = jest.fn();

      exporter.export(emptySpans, cb); // fails -> circuit opens
      exporter.export(emptySpans, cb);
      exporter.export(emptySpans, cb);

      expect(inner.export).toHaveBeenCalledTimes(1);
    });

    it('returns SUCCESS silently when the circuit is open', () => {
      const inner = makeInnerExporter(FAILED);
      const exporter = new FallibleSpanExporter(inner);
      const cb = jest.fn();

      exporter.export(emptySpans, cb); // fails -> circuit opens

      cb.mockClear();
      exporter.export(emptySpans, cb);

      expect(cb).toHaveBeenCalledWith(SUCCESS);
    });

    it('recovers and resumes exporting once the backoff window elapses', () => {
      const inner = makeInnerExporter(FAILED);
      const exporter = new FallibleSpanExporter(inner);
      const cb = jest.fn();

      exporter.export(emptySpans, cb); // fail 1 -> circuit opens
      expect(inner.export).toHaveBeenCalledTimes(1);

      // endpoint recovers, backoff window elapses
      inner.export.mockImplementation((_s, c) => c(SUCCESS));
      jest.advanceTimersByTime(DEFAULT_INITIAL_BACKOFF_MS + 1);

      exporter.export(emptySpans, cb);

      expect(inner.export).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenLastCalledWith(SUCCESS);
    });
  });

  describe('delegation', () => {
    it('delegates forceFlush to the inner exporter', async () => {
      const inner = makeInnerExporter(SUCCESS);
      await new FallibleSpanExporter(inner).forceFlush();
      expect(inner.forceFlush).toHaveBeenCalledTimes(1);
    });

    it('resolves forceFlush when inner exporter has no forceFlush', async () => {
      const inner = makeInnerExporter(SUCCESS);
      delete (inner as Partial<SpanExporter>).forceFlush;
      await expect(new FallibleSpanExporter(inner).forceFlush()).resolves.toBeUndefined();
    });

    it('delegates shutdown to the inner exporter', async () => {
      const inner = makeInnerExporter(SUCCESS);
      await new FallibleSpanExporter(inner).shutdown();
      expect(inner.shutdown).toHaveBeenCalledTimes(1);
    });
  });
});
