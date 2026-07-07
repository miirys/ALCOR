import fs from 'fs';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { type Disposable } from '@gitlab-org/disposable';
import { CLI_INPUT_TYPES, type LogPreviewDialogCallbacks } from '@gitlab-org/tui';
import type { ControllerApi } from '../commands/tui/controller_api';

export interface LogPreviewController extends Disposable {
  openLogPreview(api: ControllerApi, logFilePath: string, logContent?: string): Promise<void>;
  closeLogPreview(api: ControllerApi): void;
  getCallbacks(api: ControllerApi): LogPreviewDialogCallbacks;
}

export const LogPreviewController = createInterfaceId<LogPreviewController>('LogPreviewController');

@Implements(LogPreviewController)
@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultLogPreviewController implements LogPreviewController {
  #logger: Logger;

  /**
   * Tracks whether log preview is currently open to prevent concurrent opens.
   */
  #isPreviewOpen = false;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[LogPreviewController]');
  }

  async openLogPreview(
    api: ControllerApi,
    logFilePath: string,
    logContent?: string,
  ): Promise<void> {
    // Guard against concurrent calls - if a preview is already open, ignore this call
    if (this.#isPreviewOpen) {
      this.#logger.warn('Log preview already open, ignoring concurrent open request');
      return;
    }

    // Set flag immediately after guard check to prevent race conditions
    this.#isPreviewOpen = true;

    try {
      // Use provided content or read from file
      const content = logContent ?? (await this.#readLast200Lines(logFilePath));

      // Set log preview fields in FeedbackInputState
      let invalidState = false;
      api.mutateState((state) => {
        if (state.input.inputType !== CLI_INPUT_TYPES.FEEDBACK) {
          invalidState = true;
          return state;
        }

        return {
          ...state,
          input: {
            ...state.input,
            showLogPreview: true,
            logPreviewContent: content,
            logPreviewPath: logFilePath,
          },
        };
      });

      // Reset flag outside the callback to avoid side effects in pure state transformation
      if (invalidState) {
        this.#logger.warn('Cannot open log preview: not in feedback flow');
        this.#isPreviewOpen = false;
      }
    } catch (error) {
      // Reset flag on error so user can retry
      this.#isPreviewOpen = false;
      this.#logger.error('Failed to open log preview', error);
      throw error;
    }
  }

  closeLogPreview(api: ControllerApi): void {
    this.#isPreviewOpen = false;
    api.mutateState((state) => {
      if (state.input.inputType !== CLI_INPUT_TYPES.FEEDBACK) {
        return state;
      }

      return {
        ...state,
        input: {
          ...state.input,
          showLogPreview: false,
          logPreviewContent: undefined,
          logPreviewPath: undefined,
        },
      };
    });
  }

  getCallbacks(api: ControllerApi): LogPreviewDialogCallbacks {
    return {
      onCloseLogPreview: () => this.closeLogPreview(api),
    };
  }

  dispose(): void {
    // Reset state on disposal to prevent memory leaks
    this.#isPreviewOpen = false;
  }

  async #readLast200Lines(filePath: string): Promise<string> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const last200 = lines.slice(-200);
      return last200.join('\n');
    } catch (error) {
      this.#logger.error('Failed to read log file for preview', error);
      return `Error reading log file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
