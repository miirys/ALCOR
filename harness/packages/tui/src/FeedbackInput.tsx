import React, { useRef, useState } from 'react';
import { Box, Text } from 'ink';
import type { ChoiceOption, FeedbackInputState } from './types';
import { CLI_INPUT_TYPES } from './constants';
import { LogPreviewDialog, logPreviewFooterHint } from './LogPreviewDialog';
import { Link } from './lib/components/Link';
import { MultilineTextInput } from './lib/components/MultilineTextInput';
import { Spinner } from './lib/components/Spinner';
import { useKeyHandler } from './lib/key_handler';
import { KeyChecks } from './lib/input/unified';
import { TextBuffer } from './lib/text_buffer';

export interface FeedbackCallbacks {
  onSelectFeedbackType: (type: 'bug' | 'feature') => void;
  onSubmitDescription: (description: string) => void;
  onSubmitTitle: (title: string) => void;
  onCancelTitle: () => void;
  onConfirmLogInclusion: (includeLog: boolean) => void;
  onCancelLogConfirmation: () => void;
  onPreviewLogs: () => void;
  onCancelFeedback: () => void;
  onCloseFeedbackSuccess: () => void;
  onCloseLogPreview: () => void;
}

interface FeedbackInputProps {
  input: FeedbackInputState;
  callbacks: FeedbackCallbacks;
}

export const feedbackFooterHint = (input: FeedbackInputState): string | null => {
  if (input.showLogPreview && input.logPreviewContent && input.logPreviewPath) {
    return logPreviewFooterHint(input.logPreviewContent);
  }
  switch (input.step) {
    case 'type-selection':
      return '↑/↓ to navigate • Enter to select • Esc to cancel';
    case 'description':
      return 'Enter to continue • Esc to cancel';
    case 'title':
      return 'Enter to continue • Esc to go back';
    case 'log-confirmation':
      return '↑/↓ to navigate • Enter to select • p to preview logs • Esc to go back';
    case 'success':
      return 'Enter to continue';
    case 'submitting':
    default:
      return null;
  }
};

const feedbackTypeOptions: ChoiceOption<'bug' | 'feature'>[] = [
  {
    label: 'Bug Report',
    value: 'bug',
    description: 'Report an issue or problem',
  },
  {
    label: 'Feature Request / Idea',
    value: 'feature',
    description: 'Suggest a new feature or improvement',
  },
];

type StepHeaderProps =
  | { primary: string; secondary: string; children?: never }
  | { primary?: never; secondary?: never; children: string };

const StepHeader: React.FC<StepHeaderProps> = ({ primary, secondary, children }) => {
  return (
    <Box paddingX={1} marginBottom={1}>
      {primary && secondary ? (
        <>
          <Text color="#e8e8ee" bold>
            {primary}
          </Text>
          <Text color="dim"> — {secondary}</Text>
        </>
      ) : (
        <Text>{children}</Text>
      )}
    </Box>
  );
};

interface TypeSelectionStepProps {
  callbacks: FeedbackCallbacks;
}

const TypeSelectionStep: React.FC<TypeSelectionStepProps> = ({ callbacks }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (event.name === 'up') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      event.stopPropagation();
      return;
    }

    if (event.name === 'down') {
      setSelectedIndex((prev) => Math.min(feedbackTypeOptions.length - 1, prev + 1));
      event.stopPropagation();
      return;
    }

    if (event.name === 'return') {
      callbacks.onSelectFeedbackType(feedbackTypeOptions[selectedIndex].value);
      event.stopPropagation();
    }
  });

  return (
    <Box flexDirection="column">
      <StepHeader>What type of feedback would you like to submit?</StepHeader>

      <Box flexDirection="column" paddingLeft={2}>
        {feedbackTypeOptions.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={option.value} marginBottom={0}>
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                {isSelected ? '❯ ' : '  '}
                {option.label}
              </Text>
              {option.description && <Text color="dim"> - {option.description}</Text>}
            </Box>
          );
        })}
      </Box>

      <Box height={1} />
    </Box>
  );
};

interface DescriptionStepProps {
  input: FeedbackInputState;
  callbacks: FeedbackCallbacks;
  description: string;
  onDescriptionChange: (value: string) => void;
  textBufferRef: React.MutableRefObject<TextBuffer>;
}

const DescriptionStep: React.FC<DescriptionStepProps> = ({
  input,
  callbacks,
  description,
  onDescriptionChange,
  textBufferRef,
}) => {
  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (KeyChecks.isEnter(event)) {
      callbacks.onSubmitDescription(description);
      event.stopPropagation();
    }
  });

  const feedbackTypeLabel = input.selectedType === 'bug' ? 'Bug Report' : 'Feature Request';
  const descriptionHint =
    input.selectedType === 'bug' ? 'Describe the issue:' : 'Describe your idea:';

  return (
    <Box flexDirection="column">
      <StepHeader primary={feedbackTypeLabel} secondary={descriptionHint} />

      <MultilineTextInput
        value={description}
        onChange={onDescriptionChange}
        placeholder="Type your feedback here..."
        initialTextBuffer={textBufferRef.current}
        maxVisibleLines={10}
      />

      {input.isGitLabDotCom === false && description.length > 1000 && (
        <Box paddingX={1} marginTop={1}>
          <Text color="yellow">
            Please press 'Enter' to continue. Long descriptions may be truncated on issue creation,
            but you will have a chance to add to your description before submission.
          </Text>
        </Box>
      )}
    </Box>
  );
};

interface TitleStepProps {
  input: FeedbackInputState;
  callbacks: FeedbackCallbacks;
  title: string;
  onTitleChange: (value: string) => void;
  titleTextBufferRef: React.MutableRefObject<TextBuffer>;
}

const TitleStep: React.FC<TitleStepProps> = ({
  input,
  callbacks,
  title,
  onTitleChange,
  titleTextBufferRef,
}) => {
  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (KeyChecks.isEnter(event)) {
      callbacks.onSubmitTitle(title);
      event.stopPropagation();
      return;
    }

    if (event.name === 'escape') {
      callbacks.onCancelTitle();
      event.stopPropagation();
    }
  });

  const feedbackTypeLabel = input.selectedType === 'bug' ? 'Bug Report' : 'Feature Request';

  return (
    <Box flexDirection="column">
      <StepHeader
        primary={feedbackTypeLabel}
        secondary="Add a title (optional - a default will be generated if left empty):"
      />

      <MultilineTextInput
        value={title}
        onChange={onTitleChange}
        placeholder="Enter a title..."
        initialTextBuffer={titleTextBufferRef.current}
        maxVisibleLines={3}
      />
    </Box>
  );
};

interface LogConfirmationStepProps {
  callbacks: FeedbackCallbacks;
}

const LogConfirmationStep: React.FC<LogConfirmationStepProps> = ({ callbacks }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const logInclusionOptions: ChoiceOption<boolean>[] = [
    {
      label: 'Yes, include recent logs (recommended)',
      value: true,
      description: 'Helps with debugging',
    },
    {
      label: 'No, skip logs',
      value: false,
      description: 'Only include system info',
    },
  ];

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (event.name === 'up') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      event.stopPropagation();
      return;
    }

    if (event.name === 'down') {
      setSelectedIndex((prev) => Math.min(logInclusionOptions.length - 1, prev + 1));
      event.stopPropagation();
      return;
    }

    if (event.name === 'return') {
      callbacks.onConfirmLogInclusion(logInclusionOptions[selectedIndex].value);
      event.stopPropagation();
      return;
    }

    // 'p' key to preview logs
    if (event.name === 'p') {
      callbacks.onPreviewLogs();
      event.stopPropagation();
      return;
    }

    if (event.name === 'escape') {
      callbacks.onCancelLogConfirmation();
      event.stopPropagation();
    }
  });

  return (
    <Box flexDirection="column">
      <StepHeader>Include recent CLI logs with this bug report?</StepHeader>
      <Box paddingX={1} marginBottom={1} flexDirection="column">
        <Text color="dim">
          Issues with logs will be marked as confidential (visible only to GitLab team members).
          Press 'p' to preview logs.
        </Text>
        <Text color="dim">⚠ Logs may contain file paths and other sensitive data.</Text>
      </Box>

      <Box flexDirection="column" paddingLeft={2}>
        {logInclusionOptions.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={String(option.value)} marginBottom={0}>
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                {isSelected ? '❯ ' : '  '}
                {option.label}
              </Text>
              {option.description && <Text color="dim"> - {option.description}</Text>}
            </Box>
          );
        })}
      </Box>

      <Box height={1} />
    </Box>
  );
};

const SubmittingStep: React.FC = () => {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Spinner text="Submitting feedback..." />
    </Box>
  );
};

interface SuccessStepProps {
  input: FeedbackInputState;
  callbacks: FeedbackCallbacks;
}

const SuccessStep: React.FC<SuccessStepProps> = ({ input, callbacks }) => {
  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (event.name === 'return') {
      callbacks.onCloseFeedbackSuccess();
      event.stopPropagation();
    }
  });

  const isUrlSubmission = input.submissionMethod === 'url';

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="green">
            {isUrlSubmission
              ? '✓ Feedback form opened in browser!'
              : '✓ Feedback submitted successfully!'}
          </Text>
        </Box>

        {isUrlSubmission ? (
          <Box marginBottom={1}>
            <Text>Please complete the issue creation in GitLab.</Text>
          </Box>
        ) : (
          <>
            {input.issueNumber && (
              <Box marginBottom={1}>
                <Text>Issue #{input.issueNumber} created</Text>
              </Box>
            )}
            {input.issueUrl && (
              <Box marginBottom={1}>
                <Link url={input.issueUrl} color="dim">
                  {input.issueUrl}
                </Link>
              </Box>
            )}
          </>
        )}

        <Box>
          <Text color="dim">Thank you for helping improve ALCOR!</Text>
        </Box>
      </Box>
    </Box>
  );
};

export const FeedbackInput: React.FC<FeedbackInputProps> = ({ input, callbacks }) => {
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const textBufferRef = useRef(new TextBuffer(''));
  const titleTextBufferRef = useRef(new TextBuffer(''));

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    const escapableSteps = ['type-selection', 'description', 'success', 'submitting'];

    if (event.name === 'escape' && escapableSteps.includes(input.step)) {
      callbacks.onCancelFeedback();
      event.stopPropagation();
    }
  });

  // If log preview is shown, render LogPreviewDialog instead of the normal feedback UI
  if (input.showLogPreview && input.logPreviewContent && input.logPreviewPath) {
    return (
      <LogPreviewDialog
        input={{
          inputType: CLI_INPUT_TYPES.LOG_PREVIEW_DIALOG,
          logContent: input.logPreviewContent,
          logFilePath: input.logPreviewPath,
        }}
        callbacks={{
          onCloseLogPreview: callbacks.onCloseLogPreview,
        }}
      />
    );
  }

  switch (input.step) {
    case 'type-selection':
      return <TypeSelectionStep callbacks={callbacks} />;

    case 'description':
      return (
        <DescriptionStep
          input={input}
          callbacks={callbacks}
          description={description}
          onDescriptionChange={setDescription}
          textBufferRef={textBufferRef}
        />
      );

    case 'title':
      return (
        <TitleStep
          input={input}
          callbacks={callbacks}
          title={title}
          onTitleChange={setTitle}
          titleTextBufferRef={titleTextBufferRef}
        />
      );

    case 'log-confirmation':
      return <LogConfirmationStep callbacks={callbacks} />;

    case 'submitting':
      return <SubmittingStep />;

    case 'success':
      return <SuccessStep input={input} callbacks={callbacks} />;

    default:
      return null;
  }
};
