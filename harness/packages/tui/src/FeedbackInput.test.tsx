import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { renderWithProviders } from './test/render_helper';
import type { FeedbackCallbacks } from './FeedbackInput';
import { FeedbackInput } from './FeedbackInput';
import type { FeedbackInputState, KeyModifiers } from './types';
import { CLI_INPUT_TYPES } from './constants';

describe('FeedbackInput', () => {
  let mockCallbacks: FeedbackCallbacks;

  beforeEach(() => {
    mockCallbacks = {
      onSelectFeedbackType: jest.fn(),
      onSubmitDescription: jest.fn(),
      onSubmitTitle: jest.fn(),
      onCancelTitle: jest.fn(),
      onConfirmLogInclusion: jest.fn(),
      onCancelLogConfirmation: jest.fn(),
      onPreviewLogs: jest.fn(),
      onCancelFeedback: jest.fn(),
      onCloseFeedbackSuccess: jest.fn(),
      onCloseLogPreview: jest.fn(),
    };
  });

  describe('TypeSelectionStep', () => {
    const createTypeSelectionState = (): FeedbackInputState =>
      createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'type-selection',
      });

    it('should render type selection options', () => {
      const input = createTypeSelectionState();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('What type of feedback would you like to submit?');
      expect(output).toContain('Bug Report');
      expect(output).toContain('Feature Request / Idea');
      expect(output).toContain('Report an issue or problem');
      expect(output).toContain('Suggest a new feature or improvement');
    });

    it('should highlight first option by default', () => {
      const input = createTypeSelectionState();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('❯ Bug Report');
    });

    it('should call onSelectFeedbackType when return is pressed', () => {
      const input = createTypeSelectionState();
      const { sendInput } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { return: true });

      expect(mockCallbacks.onSelectFeedbackType).toHaveBeenCalledWith('bug');
    });

    it('should change selection with down arrow', () => {
      const input = createTypeSelectionState();
      const { sendInput, lastFrame, rerender } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { downArrow: true });
      rerender(<FeedbackInput input={input} callbacks={mockCallbacks} />);
      const output = lastFrame();

      expect(output).toContain('❯ Feature Request / Idea');
    });

    it('should change selection with up arrow', () => {
      const input = createTypeSelectionState();
      const { sendInput, lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { downArrow: true });
      sendInput('', { upArrow: true });
      const output = lastFrame();

      expect(output).toContain('❯ Bug Report');
    });

    it('should not move selection above first option', () => {
      const input = createTypeSelectionState();
      const { sendInput, lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { upArrow: true });
      const output = lastFrame();

      expect(output).toContain('❯ Bug Report');
    });

    it('should not move selection below last option', () => {
      const input = createTypeSelectionState();
      const { sendInput, lastFrame, rerender } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { downArrow: true });
      rerender(<FeedbackInput input={input} callbacks={mockCallbacks} />);
      sendInput('', { downArrow: true });
      rerender(<FeedbackInput input={input} callbacks={mockCallbacks} />);
      const output = lastFrame();

      expect(output).toContain('❯ Feature Request / Idea');
    });

    it('should call onCancelFeedback when escape is pressed', () => {
      const input = createTypeSelectionState();
      const { sendInput } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { escape: true });

      expect(mockCallbacks.onCancelFeedback).toHaveBeenCalled();
    });
  });

  describe('DescriptionStep', () => {
    const createDescriptionState = (selectedType: 'bug' | 'feature' = 'bug'): FeedbackInputState =>
      createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'description',
        selectedType,
      });

    const typeNCharacters = (
      sendInput: (input: string, key?: Partial<KeyModifiers>) => void,
      char: string,
      count: number,
    ) => {
      for (let i = 0; i < count; i++) {
        sendInput(char);
      }
    };

    it('should render with bug report label', () => {
      const input = createDescriptionState('bug');
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Bug Report');
      expect(output).toContain('Describe the issue');
    });

    it('should render with feature request label', () => {
      const input = createDescriptionState('feature');
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Feature Request');
      expect(output).toContain('Describe your idea');
    });

    it('should show placeholder text', () => {
      const input = createDescriptionState();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Type your feedback here...');
    });

    // Note: Testing key handling for description submission is complex due to MultilineTextInput
    // consuming key events. The key handler is verified to exist in the implementation.
    // Actual submission behavior is tested at the controller level.

    it('should not show warning for short descriptions', () => {
      const input = createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'description',
        selectedType: 'bug',
        isGitLabDotCom: false,
      });

      const { sendInput, lastFrame, rerender } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      // Type a short description (10 characters)
      typeNCharacters(sendInput, 'a', 10);
      rerender(<FeedbackInput input={input} callbacks={mockCallbacks} />);

      const output = lastFrame();
      expect(output).not.toContain('Long descriptions may be truncated');
    });

    it('should not show warning for API submissions', () => {
      const input = createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'description',
        selectedType: 'bug',
        isGitLabDotCom: true,
      });

      const { sendInput, lastFrame, rerender } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      // Type a long description (1001 characters) - should NOT show warning for GitLab.com
      typeNCharacters(sendInput, 'a', 1001);
      rerender(<FeedbackInput input={input} callbacks={mockCallbacks} />);

      const output = lastFrame();
      expect(output).not.toContain('Long descriptions may be truncated');
    });

    it('should show warning for long descriptions on self-managed', () => {
      const input = createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'description',
        selectedType: 'bug',
        isGitLabDotCom: false,
      });

      const { sendInput, lastFrame, rerender } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      // Type a long description (1001 characters) - SHOULD show warning for self-managed
      typeNCharacters(sendInput, 'a', 1001);
      rerender(<FeedbackInput input={input} callbacks={mockCallbacks} />);

      const output = lastFrame();
      expect(output).toContain('Long descriptions may be truncated');
    });

    it('should call onCancelFeedback when escape is pressed', () => {
      const input = createDescriptionState();
      const { sendInput } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { escape: true });

      expect(mockCallbacks.onCancelFeedback).toHaveBeenCalled();
    });
  });

  describe('TitleStep', () => {
    const createTitleState = (selectedType: 'bug' | 'feature' = 'bug'): FeedbackInputState =>
      createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'title',
        selectedType,
      });

    it('should render with bug report label', () => {
      const input = createTitleState('bug');
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Bug Report');
      expect(output).toContain('Add a title');
      expect(output).toContain('optional');
    });

    it('should render with feature request label', () => {
      const input = createTitleState('feature');
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Feature Request');
    });

    it('should show placeholder text', () => {
      const input = createTitleState();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Enter a title...');
    });

    // Note: Testing key handling for title submission is complex due to MultilineTextInput
    // consuming key events. The key handler is verified to exist in the implementation.
    // Actual submission behavior is tested at the controller level.

    it('should call onCancelTitle when escape is pressed', () => {
      const input = createTitleState();
      const { sendInput } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { escape: true });

      expect(mockCallbacks.onCancelTitle).toHaveBeenCalled();
    });

    it('should not call onCancelFeedback when escape is pressed', () => {
      const input = createTitleState();
      const { sendInput } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { escape: true });

      expect(mockCallbacks.onCancelFeedback).not.toHaveBeenCalled();
    });
  });

  describe('LogConfirmationStep', () => {
    const createLogConfirmationState = (): FeedbackInputState =>
      createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'log-confirmation',
        selectedType: 'bug',
      });

    it('should render log confirmation prompt', () => {
      const input = createLogConfirmationState();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Include recent CLI logs');
      expect(output).toContain('bug report');
    });

    it('should show confidentiality notice', () => {
      const input = createLogConfirmationState();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('confidential');
      expect(output).toContain('GitLab team members');
    });

    it('should render log inclusion options', () => {
      const input = createLogConfirmationState();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Yes, include recent logs');
      expect(output).toContain('No, skip logs');
      expect(output).toContain('Helps with debugging');
      expect(output).toContain('Only include system info');
    });

    it('should highlight first option (Yes) by default', () => {
      const input = createLogConfirmationState();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('❯ Yes, include recent logs');
    });

    it('should call onConfirmLogInclusion with true when return is pressed on Yes', () => {
      const input = createLogConfirmationState();
      const { sendInput } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { return: true });

      expect(mockCallbacks.onConfirmLogInclusion).toHaveBeenCalledWith(true);
    });

    it('should call onConfirmLogInclusion with false when return is pressed on No', () => {
      const input = createLogConfirmationState();
      const { sendInput, rerender } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { downArrow: true });
      rerender(<FeedbackInput input={input} callbacks={mockCallbacks} />);
      sendInput('', { return: true });

      expect(mockCallbacks.onConfirmLogInclusion).toHaveBeenCalledWith(false);
    });

    it('should change selection with down arrow', () => {
      const input = createLogConfirmationState();
      const { sendInput, lastFrame, rerender } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { downArrow: true });
      rerender(<FeedbackInput input={input} callbacks={mockCallbacks} />);
      const output = lastFrame();

      expect(output).toContain('❯ No, skip logs');
    });

    it('should change selection with up arrow', () => {
      const input = createLogConfirmationState();
      const { sendInput, lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { downArrow: true });
      sendInput('', { upArrow: true });
      const output = lastFrame();

      expect(output).toContain('❯ Yes, include recent logs');
    });

    it('should not move selection above first option', () => {
      const input = createLogConfirmationState();
      const { sendInput, lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { upArrow: true });
      const output = lastFrame();

      expect(output).toContain('❯ Yes, include recent logs');
    });

    it('should not move selection below last option', () => {
      const input = createLogConfirmationState();
      const { sendInput, lastFrame, rerender } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { downArrow: true });
      rerender(<FeedbackInput input={input} callbacks={mockCallbacks} />);
      sendInput('', { downArrow: true });
      rerender(<FeedbackInput input={input} callbacks={mockCallbacks} />);
      const output = lastFrame();

      expect(output).toContain('❯ No, skip logs');
    });

    it('should call onCancelLogConfirmation when escape is pressed', () => {
      const input = createLogConfirmationState();
      const { sendInput } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { escape: true });

      expect(mockCallbacks.onCancelLogConfirmation).toHaveBeenCalled();
    });

    it('should not call onCancelFeedback when escape is pressed', () => {
      const input = createLogConfirmationState();
      const { sendInput } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { escape: true });

      expect(mockCallbacks.onCancelFeedback).not.toHaveBeenCalled();
    });

    it('should call onPreviewLogs when p key is pressed', () => {
      const input = createLogConfirmationState();
      const { sendInput } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('p');

      expect(mockCallbacks.onPreviewLogs).toHaveBeenCalled();
    });
  });

  describe('Nested Log Preview', () => {
    const createLogPreviewState = (): FeedbackInputState =>
      createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'log-confirmation',
        showLogPreview: true,
        logPreviewContent: 'Sample log content\nLine 2\nLine 3',
        logPreviewPath: '/path/to/logs.txt',
      });

    it('should render LogPreviewDialog when showLogPreview is true', () => {
      const input = createLogPreviewState();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Recent ALCOR Logs');
      expect(output).toContain('Last 200 lines from /path/to/logs.txt');
      expect(output).toContain('Sample log content');
    });

    it('should not render normal feedback UI when showLogPreview is true', () => {
      const input = createLogPreviewState();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).not.toContain('Include recent CLI logs with this bug report?');
    });

    it('should call onCloseLogPreview when Escape is pressed in log preview', () => {
      const input = createLogPreviewState();
      const { sendInput } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { escape: true });

      expect(mockCallbacks.onCloseLogPreview).toHaveBeenCalled();
    });

    it('should not call onCancelLogConfirmation when Escape is pressed in log preview', () => {
      const input = createLogPreviewState();
      const { sendInput } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { escape: true });

      expect(mockCallbacks.onCancelLogConfirmation).not.toHaveBeenCalled();
    });

    it('should not render LogPreviewDialog if showLogPreview is false', () => {
      const input = createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'log-confirmation',
        showLogPreview: false,
        logPreviewContent: 'Content',
        logPreviewPath: '/path',
      });

      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Include recent CLI logs');
      expect(output).not.toContain('Recent ALCOR Logs');
    });

    it('should not render LogPreviewDialog if logPreviewContent is missing', () => {
      const input = createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'log-confirmation',
        showLogPreview: true,
        logPreviewContent: undefined,
        logPreviewPath: '/path',
      });

      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Include recent CLI logs');
      expect(output).not.toContain('Recent ALCOR Logs');
    });

    it('should not render LogPreviewDialog if logPreviewPath is missing', () => {
      const input = createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'log-confirmation',
        showLogPreview: true,
        logPreviewContent: 'Content',
        logPreviewPath: undefined,
      });

      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Include recent CLI logs');
      expect(output).not.toContain('Recent ALCOR Logs');
    });
  });

  describe('SubmittingStep', () => {
    const createSubmittingState = (): FeedbackInputState =>
      createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'submitting',
        selectedType: 'bug',
      });

    it('should render spinner with submitting text', () => {
      const input = createSubmittingState();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Submitting feedback...');
    });
  });

  describe('SuccessStep', () => {
    const createSuccessStateApi = (): FeedbackInputState =>
      createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'success',
        selectedType: 'bug',
        submissionMethod: 'api',
        issueNumber: 123,
        issueUrl: 'https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/123',
      });

    const createSuccessStateUrl = (): FeedbackInputState =>
      createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        step: 'success',
        selectedType: 'feature',
        submissionMethod: 'url',
      });

    it('should render success message for API submission', () => {
      const input = createSuccessStateApi();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('✓ Feedback submitted successfully!');
      expect(output).toContain('Thank you for helping improve ALCOR!');
    });

    it('should render issue number for API submission', () => {
      const input = createSuccessStateApi();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('Issue #123 created');
    });

    it('should render issue URL for API submission', () => {
      const input = createSuccessStateApi();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain(
        'https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/123',
      );
    });

    it('should render success message for URL submission', () => {
      const input = createSuccessStateUrl();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toContain('✓ Feedback form opened in browser!');
      expect(output).toContain('Please complete the issue creation in GitLab');
      expect(output).toContain('Thank you for helping improve ALCOR!');
    });

    it('should not render issue number for URL submission', () => {
      const input = createSuccessStateUrl();
      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).not.toContain('Issue #');
    });

    it('should call onCloseFeedbackSuccess when return is pressed', () => {
      const input = createSuccessStateApi();
      const { sendInput } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );

      sendInput('', { return: true });

      expect(mockCallbacks.onCloseFeedbackSuccess).toHaveBeenCalled();
    });
  });

  describe('Unknown step', () => {
    it('should render nothing for unknown step', () => {
      const input = createFakePartial<FeedbackInputState>({
        inputType: CLI_INPUT_TYPES.FEEDBACK,
        // @ts-expect-error - testing invalid step
        step: 'invalid-step',
      });

      const { lastFrame } = renderWithProviders(
        <FeedbackInput input={input} callbacks={mockCallbacks} />,
      );
      const output = lastFrame();

      expect(output).toBe('');
    });
  });
});
