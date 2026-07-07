import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { McpApprovalInputState } from '../types';
import { CLI_INPUT_TYPES } from '../constants';
import { renderWithProviders } from '../test/render_helper';
import type { McpApprovalCallbacks } from './McpApprovalInput';
import { McpApprovalInput } from './McpApprovalInput';

const createInputState = (
  overrides: Partial<McpApprovalInputState> = {},
): McpApprovalInputState => ({
  inputType: CLI_INPUT_TYPES.MCP_APPROVAL,
  servers: [
    { name: 'my-server', decision: 'approve' },
    { name: 'another-server', decision: 'approve' },
  ],
  storagePath: '/home/user/.gitlab/storage.json',
  ...overrides,
});

const renderApproval = (input: McpApprovalInputState, callbacks: McpApprovalCallbacks) =>
  renderWithProviders(<McpApprovalInput input={input} callbacks={callbacks} />);

describe('McpApprovalInput', () => {
  let callbacks: McpApprovalCallbacks;

  beforeEach(() => {
    callbacks = createFakePartial<McpApprovalCallbacks>({
      onConfirm: jest.fn(),
      onEscape: jest.fn(),
    });
  });

  describe('rendering', () => {
    it('renders the approval header', () => {
      const { lastFrame } = renderApproval(createInputState(), callbacks);
      expect(lastFrame()).toContain('MCP server approval required');
    });

    it('renders all server names with Approve badges by default', () => {
      const { lastFrame } = renderApproval(createInputState(), callbacks);
      const output = lastFrame();
      expect(output).toContain('my-server');
      expect(output).toContain('another-server');
      expect(output).toContain('Approve');
    });

    it('renders the storage path hint', () => {
      const { lastFrame } = renderApproval(createInputState(), callbacks);
      expect(lastFrame()).toContain('/home/user/.gitlab/storage.json');
    });
  });

  describe('keyboard handling', () => {
    it('toggles the selected row to Reject when Space is pressed', () => {
      const input = createInputState();
      const { sendInput, rerender, lastFrame } = renderApproval(input, callbacks);
      sendInput(' ');
      rerender(<McpApprovalInput input={input} callbacks={callbacks} />);
      expect(lastFrame()).toContain('Reject');
    });

    it('toggles back to Approve when Space is pressed twice', () => {
      const input = createInputState();
      const { sendInput, rerender } = renderApproval(input, callbacks);
      sendInput(' ');
      rerender(<McpApprovalInput input={input} callbacks={callbacks} />);
      sendInput(' ');
      rerender(<McpApprovalInput input={input} callbacks={callbacks} />);
      sendInput('', { return: true });
      expect(callbacks.onConfirm).toHaveBeenCalledWith([
        { name: 'my-server', decision: 'approve' },
        { name: 'another-server', decision: 'approve' },
      ]);
    });

    it('calls onConfirm with the current decisions when Enter is pressed', () => {
      const { sendInput } = renderApproval(createInputState(), callbacks);
      sendInput('', { return: true });
      expect(callbacks.onConfirm).toHaveBeenCalledWith([
        { name: 'my-server', decision: 'approve' },
        { name: 'another-server', decision: 'approve' },
      ]);
    });

    it('reflects a toggled decision in the onConfirm payload', () => {
      const input = createInputState();
      const { sendInput, rerender } = renderApproval(input, callbacks);
      sendInput(' '); // toggle first row to reject
      rerender(<McpApprovalInput input={input} callbacks={callbacks} />);
      sendInput('', { return: true });
      expect(callbacks.onConfirm).toHaveBeenCalledWith([
        { name: 'my-server', decision: 'reject' },
        { name: 'another-server', decision: 'approve' },
      ]);
    });

    it('toggles the second row after navigating down', () => {
      const input = createInputState();
      const { sendInput, rerender } = renderApproval(input, callbacks);
      sendInput('', { downArrow: true });
      rerender(<McpApprovalInput input={input} callbacks={callbacks} />);
      sendInput(' '); // toggle second row
      rerender(<McpApprovalInput input={input} callbacks={callbacks} />);
      sendInput('', { return: true });
      expect(callbacks.onConfirm).toHaveBeenCalledWith([
        { name: 'my-server', decision: 'approve' },
        { name: 'another-server', decision: 'reject' },
      ]);
    });

    it('calls onEscape and not onConfirm when Escape is pressed', () => {
      const { sendInput } = renderApproval(createInputState(), callbacks);
      sendInput('', { escape: true });
      expect(callbacks.onEscape).toHaveBeenCalled();
      expect(callbacks.onConfirm).not.toHaveBeenCalled();
    });
  });
});
