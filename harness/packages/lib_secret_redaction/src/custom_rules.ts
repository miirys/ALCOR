import type { IRawGitleaksRule } from './gitleaks_rules';

export const SENSITIVE_ENV_VARS = [
  'GITLAB_TOKEN',
  'GITLAB_OAUTH_TOKEN',
  'DUO_WORKFLOW_GIT_HTTP_PASSWORD',
] as const;

export const customRules: IRawGitleaksRule[] = [
  {
    id: 'uri-gitlab-auth-credentials',
    description:
      'Detected GitLab authentication credentials embedded in a URI, risking credential exposure.',
    regex: '://(?:oauth2?|gitlab-ci-token|private-token|deploy-token|job-token):([^\\s@]+)@',
    secretGroup: 1,
    keywords: ['://'],
  },
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildEnvVarRules(
  env: Record<string, string | undefined> = process.env,
): IRawGitleaksRule[] {
  const rules: IRawGitleaksRule[] = [];

  for (const name of SENSITIVE_ENV_VARS) {
    const value = env[name];
    // Do not add rule if env var value is too short.
    if (value && value.length >= 8) {
      const keyword = value.slice(0, 8).toLowerCase();
      rules.push({
        id: `env-var-${name.toLowerCase().replace(/_/g, '-')}`,
        description: `Value of the ${name} environment variable.`,
        regex: `(${escapeRegex(value)})`,
        secretGroup: 1,
        keywords: [keyword],
      });
    }
  }

  return rules;
}

/**
 * Build a redaction rule matching a known secret value verbatim, for when the exact
 * plaintext is already in hand and pattern detection may not match its format.
 * Returns `undefined` for values too short to redact safely.
 */
export function buildExactValueRule(
  id: string,
  description: string,
  value: string,
): IRawGitleaksRule | undefined {
  if (value.length < 8) {
    return undefined;
  }

  return {
    id,
    description,
    regex: `(${escapeRegex(value)})`,
    secretGroup: 1,
    keywords: [value.slice(0, 8).toLowerCase()],
  };
}
