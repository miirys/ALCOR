import { SecretRedactor } from '@gitlab-org/secret-redaction';
import type { ParsedCliInput } from '../parse';
import type { RuntimeContext } from '../runtime_context';
import type { Credentials } from './credential_provider';

/**
 * Format CLI input and runtime context for safe logging.
 * Redacts secrets/tokens using the secret redactor.
 */
export function formatRunConfigForLogging(
  cliInput: ParsedCliInput,
  runtimeContext: RuntimeContext,
  credentials: Credentials,
  secretRedactor: SecretRedactor,
  extra?: Record<string, unknown>,
): string {
  const configForLogging = {
    ...cliInput,
    cliVersion: runtimeContext.cliVersion,
    gitlabBaseUrl: credentials.baseUrl,
    ...extra,
  };

  return secretRedactor.redactSecrets(JSON.stringify(configForLogging, null, 4), 'cli-run-config');
}
