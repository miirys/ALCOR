import type { TokenInfo } from '@gitlab-org/core';
import { type Credentials, formatCredentialSource } from '../../../utils/credential_provider';
import { NOT_AVAILABLE, STATUS } from '../render_helpers';

export interface AccountInputs {
  credentials: Credentials | undefined;
  tokenInfo: TokenInfo | undefined;
  username: string | undefined;
}

function determineStatus({ credentials, tokenInfo }: AccountInputs): string {
  if (!credentials || !credentials.token) return STATUS.unauthenticated;
  if (tokenInfo) return STATUS.valid;
  return STATUS.unknown;
}

export function renderAccount(inputs: AccountInputs): string {
  const { credentials, tokenInfo, username } = inputs;
  const status = determineStatus(inputs);

  const lines = ['## Account', `- Status: ${status}`];

  if (credentials) {
    const source = formatCredentialSource(credentials.source);
    lines.push(`- Source: ${source.long}`);
  }

  if (tokenInfo) {
    const scopes = tokenInfo.scopes.length > 0 ? tokenInfo.scopes.join(', ') : 'none';
    lines.push(`- Token type: ${tokenInfo.type} · scopes: ${scopes}`);
  }

  lines.push(`- Username: ${username && username.length > 0 ? username : NOT_AVAILABLE}`);

  return lines.join('\n');
}
