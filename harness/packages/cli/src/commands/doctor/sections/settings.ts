import { get, isEqual } from 'lodash-es';
import { GITLAB_API_BASE_URL } from '@gitlab-org/core';
import type { ClientConfig } from '@gitlab-org/config';

interface SettingEntry {
  readonly key: string;
  readonly defaultValue: unknown;
}

/** User-meaningful settings to display. Token-like fields are intentionally excluded. */
const SETTING_ALLOWLIST: readonly SettingEntry[] = [
  { key: 'baseUrl', defaultValue: GITLAB_API_BASE_URL },
  { key: 'logLevel', defaultValue: 'info' },
  { key: 'telemetry.enabled', defaultValue: true },
  { key: 'ignoreCertificateErrors', defaultValue: false },
  { key: 'codeCompletion.enabled', defaultValue: undefined },
  { key: 'codeCompletion.enableSecretRedaction', defaultValue: true },
  { key: 'duoChat.enabled', defaultValue: undefined },
  { key: 'duo.agentPlatform.enabled', defaultValue: undefined },
  { key: 'duo.enabledWithoutGitlabProject', defaultValue: true },
];

function describeValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

export function renderSettings(config: ClientConfig): string {
  const modified: Record<string, unknown> = {};

  for (const { key, defaultValue } of SETTING_ALLOWLIST) {
    const current = get(config, key);
    if (!isEqual(current, defaultValue)) {
      modified[key] = current;
    }
  }

  const sections = ['## Settings'];

  const keys = Object.keys(modified);
  if (keys.length === 0) {
    sections.push('All allowlisted settings are at default values.');
    return sections.join('\n\n');
  }

  sections.push('Modified settings (vs defaults):');

  const body = keys.map((key) => `- ${key}: ${describeValue(modified[key])}`).join('\n');
  sections.push(body);

  return sections.join('\n\n');
}
