import type { ChatElement } from '@gitlab-org/tui';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { Service, ServiceLifetime } from '@gitlab/needle';
import type { Session } from '../../sessions';
import { runResultSchema, RUN_RESULT_SCHEMA_VERSION } from './run_result_schema';

/** The outcome of a `run` invocation, used to build the JSON result document. */
export type RunOutcome =
  | { status: 'success'; exitCode: number }
  | { status: 'error'; exitCode: number; error: string };

/**
 * Owns the `run` stdout channel. stdout is reserved for the run's result, so
 * every write goes through here (rather than reaching for `process.stdout` from
 * the controller) to keep it a single-writer channel. Logs live on stderr.
 *
 * In json mode it emits exactly one schema-valid `RunResult` document; in text
 * mode it emits the assistant's final response as plain text.
 */
@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class RunResultWriter {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[RunResultWriter]');
  }

  /**
   * Emits the final assistant response to stdout as plain text (text mode).
   * Nothing is written when there is no completed response (e.g. a failed run);
   * the failure itself is surfaced on stderr via the controller's logs.
   */
  writeText(session: Session): void {
    const response = this.#extractFinalResponse([...session.elements]);
    if (response) {
      process.stdout.write(`${response}\n`);
    }
  }

  /**
   * Emits the result document to stdout exactly once (json mode). A
   * schema-validation or serialization failure is logged (off stdout, so the
   * stream stays clean) and swallowed: emitting nothing is preferable to
   * emitting a malformed document, and the caller still controls the exit code.
   */
  writeJson(session: Session, outcome: RunOutcome): void {
    try {
      const elements = [...session.elements];
      const base = {
        schemaVersion: RUN_RESULT_SCHEMA_VERSION,
        sessionId: session.sessionId,
        exitCode: outcome.exitCode,
        response: this.#extractFinalResponse(elements),
        elements,
      };
      const document =
        outcome.status === 'success'
          ? { ...base, status: 'success' as const }
          : { ...base, status: 'error' as const, error: outcome.error };

      const validated = runResultSchema.parse(document);
      process.stdout.write(`${JSON.stringify(validated, null, 2)}\n`);
    } catch (error) {
      this.#logger.error(
        'Failed to emit JSON result document',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /** Returns the content of the last completed assistant message, or '' if none. */
  #extractFinalResponse(elements: readonly ChatElement[]): string {
    for (let i = elements.length - 1; i >= 0; i -= 1) {
      const element = elements[i];
      if (element.type === 'message' && element.role === 'assistant' && element.isComplete) {
        return element.content;
      }
    }
    return '';
  }
}
