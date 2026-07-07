import type { Circus } from '@jest/types';
import NodeEnvironment from 'jest-environment-node';
import { deriveCastPath, uploadRecording } from './recorded_test';
import { dumpCliLogs } from './test_utils';

const FAILURE_EVENTS = new Set(['test_fn_failure', 'hook_failure']);

/**
 * Custom Jest environment that dumps CLI logs on failure and uploads
 * asciinema recordings for failed tests.
 */
// eslint-disable-next-line import/no-default-export
export default class CliLogEnvironment extends NodeEnvironment {
  // The authoritative test name, read from Jest's own expect state.
  // Set on test_start by jest-circus and available throughout test_done.
  #currentTestName: string | undefined;

  handleTestEvent(event: Circus.Event): void {
    if (event.name === 'test_start') {
      // Read from Jest's expect state — same source as
      // expect.getState().currentTestName used by recordedTest().
      // This guarantees the cast file path matches.
      const jestExpect = this.global.expect as { getState(): { currentTestName?: string } };
      this.#currentTestName = jestExpect.getState().currentTestName;
    }

    if (FAILURE_EVENTS.has(event.name)) {
      dumpCliLogs();
    }

    if (event.name === 'test_done' && event.test.errors.length > 0) {
      if (!this.#currentTestName) return;
      const castFile = deriveCastPath(this.#currentTestName);

      const url = uploadRecording(castFile);
      if (url) {
        // eslint-disable-next-line no-console
        console.error(
          `\n\x1b[1;31m🎬 FAILED TEST RECORDING\x1b[0m\n   Test:   ${event.test.name}\n   Replay: ${url}\n`,
        );
      }
    }
  }
}
