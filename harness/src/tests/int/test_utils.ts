import { expect } from '@jest/globals';
import type { URI } from 'vscode-languageserver';
import type { LspClient } from './lsp_client';

/**
 * We don't need to check this in the non-bundle CI jobs
 */
export const shouldValidateCIAndBundle = process.env.VALIDATE_CI_AND_BUNDLE
  ? describe
  : describe.skip;

export const WORKSPACE_FOLDER_URI: URI = 'file://base/path';
export const MOCK_FILE_1 = {
  uri: `${WORKSPACE_FOLDER_URI}/some-file.js`,
  languageId: 'javascript',
  version: 0,
  text: '',
};
export const MOCK_FILE_2 = {
  uri: `${WORKSPACE_FOLDER_URI}/some-other-file.js`,
  languageId: 'javascript',
  version: 0,
  text: '',
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // @ts-expect-error - TODO: fix this
    interface Matchers<LspClient> {
      toEventuallyContainChildProcessConsoleOutput(
        expectedMessage: string,
        timeoutMs?: number,
        intervalMs?: number,
      ): Promise<LspClient>;
    }
  }
}

expect.extend({
  /**
   * Custom matcher to check the language client child process console output for an expected string.
   * This is useful when an operation does not directly run some logic, (e.g. internally emits events
   * which something later does the thing you're testing), so you cannot just await and check the output.
   *
   * await expect(lsClient).toEventuallyContainChildProcessConsoleOutput('foo');
   *
   * @param lsClient LspClient instance to check
   * @param expectedMessage Message to check for
   * @param timeoutMs How long to keep checking before test is considered failed
   * @param intervalMs How frequently to check the log
   */
  async toEventuallyContainChildProcessConsoleOutput(
    lsClient: LspClient,
    expectedMessage: string,
    timeoutMs = 1000,
    intervalMs = 25,
  ) {
    const expectedResult = `Expected language service child process console output to contain "${expectedMessage}"`;
    const checkOutput = () =>
      lsClient.childProcessConsole.some((line) => line.includes(expectedMessage));
    const sleep = () =>
      new Promise((resolve) => {
        setTimeout(resolve, intervalMs);
      });

    let remainingRetries = Math.ceil(timeoutMs / intervalMs);
    while (remainingRetries > 0) {
      if (checkOutput()) {
        return {
          message: () => expectedResult,
          pass: true,
        };
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep();
      remainingRetries--;
    }

    return {
      message: () => `"${expectedResult}", but it was not found within ${timeoutMs}ms`,
      pass: false,
    };
  },
});
