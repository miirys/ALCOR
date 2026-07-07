import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { CLI_INPUT_TYPES } from './constants';
import type { LogPreviewDialogInputState } from './types';
import type { LogPreviewDialogCallbacks } from './LogPreviewDialog';
import { LogPreviewDialog } from './LogPreviewDialog';
import { renderWithProviders } from './test/render_helper';

const createInputState = (
  overrides: Partial<LogPreviewDialogInputState> = {},
): LogPreviewDialogInputState => ({
  inputType: CLI_INPUT_TYPES.LOG_PREVIEW_DIALOG,
  logContent: '',
  logFilePath: '/path/to/logs.txt',
  ...overrides,
});

const renderLogPreviewDialog = (
  input: LogPreviewDialogInputState,
  callbacks: LogPreviewDialogCallbacks,
) => {
  return renderWithProviders(<LogPreviewDialog input={input} callbacks={callbacks} />);
};

describe('LogPreviewDialog', () => {
  let callbacks: LogPreviewDialogCallbacks;

  beforeEach(() => {
    callbacks = createFakePartial<LogPreviewDialogCallbacks>({
      onCloseLogPreview: jest.fn(),
    });
  });

  describe('Empty Logs', () => {
    it('should show "No logs available" when content is empty string', () => {
      const { lastFrame } = renderLogPreviewDialog(createInputState({ logContent: '' }), callbacks);
      const output = lastFrame();

      expect(output).toContain('No logs available');
    });
  });

  describe('Short Logs (fit in viewport)', () => {
    const shortLogs = 'Line 1\nLine 2\nLine 3';

    it('should render title "Recent ALCOR Logs"', () => {
      const { lastFrame } = renderLogPreviewDialog(
        createInputState({ logContent: shortLogs }),
        callbacks,
      );
      const output = lastFrame();

      expect(output).toContain('Recent ALCOR Logs');
    });

    it('should render all log lines when logs fit in viewport', () => {
      const { lastFrame } = renderLogPreviewDialog(
        createInputState({ logContent: shortLogs }),
        callbacks,
      );
      const output = lastFrame();

      expect(output).toContain('Line 1');
      expect(output).toContain('Line 2');
      expect(output).toContain('Line 3');
    });

    it('should show file path for short logs', () => {
      const { lastFrame } = renderLogPreviewDialog(
        createInputState({ logContent: shortLogs, logFilePath: '/path/to/logs.txt' }),
        callbacks,
      );
      const output = lastFrame();

      expect(output).toContain('Last 200 lines from');
      expect(output).toContain('/path/to/logs.txt');
    });

    it('should NOT show scroll indicators when all logs fit in viewport', () => {
      const { lastFrame } = renderLogPreviewDialog(
        createInputState({ logContent: shortLogs }),
        callbacks,
      );
      const output = lastFrame();

      // No scroll indicators when everything fits
      expect(output).not.toContain('Older logs above');
      expect(output).not.toContain('Newer logs below');
    });
  });

  describe('Normal Logs', () => {
    const sampleLogs = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';

    it('should render title "Recent ALCOR Logs"', () => {
      const { lastFrame } = renderLogPreviewDialog(
        createInputState({ logContent: sampleLogs }),
        callbacks,
      );
      const output = lastFrame();

      expect(output).toContain('Recent ALCOR Logs');
    });

    it('should render file path from input', () => {
      const { lastFrame } = renderLogPreviewDialog(
        createInputState({ logContent: sampleLogs, logFilePath: '/var/log/duo-cli.log' }),
        callbacks,
      );
      const output = lastFrame();

      expect(output).toContain('Last 200 lines from');
      expect(output).toContain('/var/log/duo-cli.log');
    });

    it('should render log content', () => {
      const { lastFrame } = renderLogPreviewDialog(
        createInputState({ logContent: sampleLogs }),
        callbacks,
      );
      const output = lastFrame();

      expect(output).toContain('Line 1');
      expect(output).toContain('Line 2');
      expect(output).toContain('Line 3');
      expect(output).toContain('Line 4');
      expect(output).toContain('Line 5');
    });
  });

  describe('Scrolling', () => {
    // Create logs with 50 lines - more than the 13-line viewport
    const createLongLogs = () => {
      const lines = Array.from({ length: 50 }, (_, i) => `Log line ${i + 1}`);
      return lines.join('\n');
    };

    it('should initialize viewport to bottom (most recent logs)', () => {
      const { lastFrame } = renderLogPreviewDialog(
        createInputState({ logContent: createLongLogs() }),
        callbacks,
      );
      const output = lastFrame();

      // Should see the last lines (most recent)
      expect(output).toContain('Log line 50');
      expect(output).toContain('Log line 49');
      // Should NOT see the first lines
      expect(output).not.toContain('Log line 1');
      expect(output).not.toContain('Log line 2');
    });

    it('should show scroll indicator when there are more logs above', () => {
      const { lastFrame } = renderLogPreviewDialog(
        createInputState({ logContent: createLongLogs() }),
        callbacks,
      );
      const output = lastFrame();

      // At bottom, should show up indicator
      expect(output).toContain('▲');
      expect(output).toContain('Older logs above');
    });

    it('should NOT show down scroll indicator when at bottom', () => {
      const { lastFrame } = renderLogPreviewDialog(
        createInputState({ logContent: createLongLogs() }),
        callbacks,
      );
      const output = lastFrame();

      // At bottom, should NOT show down indicator
      expect(output).not.toContain('Newer logs below');
    });
  });

  describe('Keyboard Events', () => {
    it('should call onCloseLogPreview when Escape is pressed', () => {
      const { sendInput } = renderLogPreviewDialog(
        createInputState({ logContent: 'Some logs' }),
        callbacks,
      );

      sendInput('', { escape: true });

      expect(callbacks.onCloseLogPreview).toHaveBeenCalled();
    });
  });
});
