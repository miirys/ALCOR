import type { AgentMode } from '../types';
import type { Theme } from './theme';

/**
 * ALCOR palette — monochrome silver core. Color is reserved for diffs,
 * state markers, and warnings; everything else stays greyscale.
 */
export const colors = {
  bright: '#f4f4f5',
  accent: '#e8e8ee',
  accentDim: '#8a8a94',
  fg: '#c9c9cf',
  dim: '#6a6a74',
  faint: '#44444c',
  border: '#2a2a32',
  borderActive: '#4a4a56',

  green: '#9ece6a',
  red: '#f7768e',
  yellow: '#e0af68',
  cyan: '#9db4c0',

  white: '#FFFFFF',
};

const USER_MESSAGE_BG: Record<Theme, string> = {
  dark: '#1e1e24',
  light: '#dcdcde',
};

export const getUserMessageBg = (theme: Theme): string => USER_MESSAGE_BG[theme];

// BUILD stays monochrome; PLAN is the only mode that colors the chrome.
// Resolved at call time so live theme switches (lib/themes.ts mutates
// `colors` in place) take effect without a reload.
export const getAgentColor = (agent?: AgentMode): string => {
  if (agent === 'build') return colors.accent;
  if (agent === 'plan') return colors.yellow;
  return colors.fg;
};

// Input-bar border: only PLAN recolors it; BUILD keeps the neutral border.
export const getAgentBorderColor = (agent?: AgentMode): string =>
  agent === 'plan' ? colors.yellow : colors.borderActive;

const AGENT_PREFIXES: Record<AgentMode, string> = {
  build: '❯ ',
  plan: '▤ ',
};

export const getAgentPrefix = (agent?: AgentMode): string =>
  (agent && AGENT_PREFIXES[agent]) ?? '· ';
