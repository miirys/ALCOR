import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ChoiceInput } from './ChoiceInput';
import type { AppCallbacks, ChoiceOption } from './types';
import { KeyHandlerProvider } from './lib/key_handler';
import { UnifiedInputProvider } from './lib/input/unified';

describe('ChoiceInput', () => {
  const mockOptions: ChoiceOption[] = [
    { label: 'Approve', value: 'approve', description: 'Allow tool execution' },
    { label: 'Reject', value: 'reject', description: 'Deny tool execution' },
    { label: 'Ask later', value: 'later' },
  ];

  const callbacks = createFakePartial<AppCallbacks>({});

  it('should render choice options with selected indicator', () => {
    const input = {
      value: '',
      cursorPosition: 0,
      isLoading: false,
      inputType: 'choice' as const,
      choiceOptions: mockOptions,
      selectedChoiceIndex: 0,
    };

    const { lastFrame } = render(
      <UnifiedInputProvider>
        <KeyHandlerProvider>
          <ChoiceInput input={input} callbacks={callbacks} />
        </KeyHandlerProvider>
      </UnifiedInputProvider>,
    );
    const output = lastFrame();

    expect(output).toContain('❯ Approve');
    expect(output).toContain('  Reject');
    expect(output).toContain('  Ask later');
    expect(output).toContain('Allow tool execution');
    expect(output).toContain('Deny tool execution');
  });

  it('should highlight the selected option', () => {
    const input = {
      value: '',
      cursorPosition: 0,
      isLoading: false,
      inputType: 'choice' as const,
      choiceOptions: mockOptions,
      selectedChoiceIndex: 1,
    };

    const { lastFrame } = render(
      <UnifiedInputProvider>
        <KeyHandlerProvider>
          <ChoiceInput input={input} callbacks={callbacks} />
        </KeyHandlerProvider>
      </UnifiedInputProvider>,
    );
    const output = lastFrame();

    expect(output).toContain('  Approve');
    expect(output).toContain('❯ Reject');
    expect(output).toContain('  Ask later');
  });

  it('should render without descriptions when not provided', () => {
    const simpleOptions: ChoiceOption[] = [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ];

    const input = {
      value: '',
      cursorPosition: 0,
      isLoading: false,
      inputType: 'choice' as const,
      choiceOptions: simpleOptions,
      selectedChoiceIndex: 0,
    };

    const { lastFrame } = render(
      <UnifiedInputProvider>
        <KeyHandlerProvider>
          <ChoiceInput input={input} callbacks={callbacks} />
        </KeyHandlerProvider>
      </UnifiedInputProvider>,
    );
    const output = lastFrame();

    expect(output).toContain('❯ Yes');
    expect(output).toContain('  No');
    expect(output).not.toContain(' - ');
  });
});
