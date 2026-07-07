import type { AppState, TextInputState } from './types';

export const defaultInputState: TextInputState = {
  inputType: 'text',
  lines: [''],
  cursorLine: 0,
  cursorColumn: 0,
};

export const defaultAppState: AppState = {
  elements: [],
  isLoading: false,
  input: defaultInputState,
  expanded: false,
  cwd: '',
  gitlabRemoteInfo: { status: 'not-checked' },
  selectedModel: '',
  availableAgents: ['build', 'plan'],
  selectedAgent: 'build',
};
