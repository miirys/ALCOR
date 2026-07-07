import {
  AGENT_PLATFORM,
  AGENTIC_CHAT,
  AUTHENTICATION,
  CHAT,
  CHAT_TERMINAL_CONTEXT,
  CODE_SUGGESTIONS,
  type Feature,
  type FeatureState,
  FLOWS,
  SANDBOX,
  STATE_CHECK_USER_READABLE_LABELS,
} from '@gitlab-org/core';
import { STATUS } from '../render_helpers';

export const FEATURE_TITLES: Partial<Record<Feature, string>> = {
  [CHAT]: 'GitLab Duo Chat',
  [AGENT_PLATFORM]: 'Agent Platform',
  [AGENTIC_CHAT]: 'Agentic Chat',
  [SANDBOX]: 'Sandbox',
};

// Features intentionally omitted from the diagnostics report. Listed explicitly
// so test catches new Features added in @gitlab-org/core.
export const EXCLUDED_FEATURES: readonly Feature[] = [
  AUTHENTICATION,
  CODE_SUGGESTIONS,
  CHAT_TERMINAL_CONTEXT,
  FLOWS,
];

function renderFeature(state: FeatureState, title: string): string {
  const lines = [`### ${title}`];

  if (state.allChecks.length === 0) {
    lines.push('- (no checks available)');
    return lines.join('\n');
  }

  for (const check of state.allChecks) {
    const badge = check.engaged ? STATUS.fail : STATUS.pass;
    const label = STATE_CHECK_USER_READABLE_LABELS[check.checkId] ?? check.checkId;
    const detail = check.engaged && check.details ? ` — ${check.details}` : '';
    lines.push(`- ${badge} ${label}${detail}`);
  }

  return lines.join('\n');
}

export function renderFeatures(featureStates: readonly FeatureState[]): string {
  const sections = ['## Features'];

  const visible = featureStates.flatMap((state) => {
    const title = FEATURE_TITLES[state.featureId];
    return title ? [{ state, title }] : [];
  });

  if (visible.length === 0) {
    sections.push('_No feature checks available._');
    return sections.join('\n\n');
  }

  for (const { state, title } of visible) {
    sections.push(renderFeature(state, title));
  }

  return sections.join('\n\n');
}
