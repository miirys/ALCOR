import { describe, it, expect, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ToolRejectionReasonInput } from './ToolRejectionReasonInput';
import type { AppCallbacks, ToolRejectionReasonInputState } from './types';
import { CLI_INPUT_TYPES } from './constants';
import { renderWithProviders } from './test/render_helper';

const waitMs = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('ToolRejectionReasonInput', () => {
  const callbacks = createFakePartial<AppCallbacks>({});

  const createInput = (toolName: string): ToolRejectionReasonInputState => ({
    inputType: CLI_INPUT_TYPES.TOOL_REJECTION_REASON,
    toolName,
  });

  it('should render the prompt with the tool name', () => {
    const { lastFrame } = renderWithProviders(
      <ToolRejectionReasonInput input={createInput('read_file')} callbacks={callbacks} />,
    );
    expect(lastFrame()).toContain('Reason for rejecting read_file (optional, Enter to skip):');
  });

  describe('keyboard interaction', () => {
    const createCallbacks = () =>
      createFakePartial<AppCallbacks>({
        onSubmitRejectionReason: jest.fn(),
        onCancelRejectionReason: jest.fn(),
      });

    describe('when Enter is pressed', () => {
      it('calls onSubmitRejectionReason with the current text', async () => {
        const testCallbacks = createCallbacks();
        const { sendInput } = renderWithProviders(
          <ToolRejectionReasonInput input={createInput('read_file')} callbacks={testCallbacks} />,
        );

        sendInput('h');
        sendInput('i');
        await waitMs(50);

        sendInput('', { return: true });
        await waitMs(50);

        expect(testCallbacks.onSubmitRejectionReason).toHaveBeenCalledWith('hi');
      });
    });

    describe('when Enter is pressed with empty input', () => {
      it('calls onSubmitRejectionReason with empty string', async () => {
        const testCallbacks = createCallbacks();
        const { sendInput } = renderWithProviders(
          <ToolRejectionReasonInput input={createInput('read_file')} callbacks={testCallbacks} />,
        );

        sendInput('', { return: true });
        await waitMs(50);

        expect(testCallbacks.onSubmitRejectionReason).toHaveBeenCalledWith('');
      });
    });

    describe('when Escape is pressed', () => {
      it('calls onCancelRejectionReason', async () => {
        const testCallbacks = createCallbacks();
        const { sendInput } = renderWithProviders(
          <ToolRejectionReasonInput input={createInput('read_file')} callbacks={testCallbacks} />,
        );

        sendInput('', { escape: true });
        await waitMs(50);

        expect(testCallbacks.onCancelRejectionReason).toHaveBeenCalled();
      });
    });
  });
});
