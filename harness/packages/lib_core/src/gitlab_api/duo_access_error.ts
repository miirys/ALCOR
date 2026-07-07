const DUO_DEFAULT_NAMESPACE_DOCS_URL =
  'https://docs.gitlab.com/user/profile/preferences/#set-a-default-gitlab-duo-namespace';

// Used when a namespace/project was resolved but is not entitled
export const DUO_NAMESPACE_NOT_ENTITLED_MESSAGE =
  'GitLab Duo Agent Platform is not available for this namespace or project.\n\n' +
  'This usually means:\n' +
  '- The group does not have a GitLab Duo subscription, or its beta/experimental features are off.\n' +
  '- Personal (user) namespaces are not supported for the Agent Platform.\n\n' +
  'Next steps:\n' +
  '- Use a project in a group that has GitLab Duo enabled.\n' +
  `- Or set a default GitLab Duo namespace that is entitled for Duo: ${DUO_DEFAULT_NAMESPACE_DOCS_URL}\n` +
  '- If you believe this group should have access, contact your administrator or group Owner.';

export const DUO_NO_NAMESPACE_DETECTED_MESSAGE =
  'Could not determine a GitLab Duo namespace.\n\n' +
  'Set a default GitLab Duo namespace in your user preferences, or run from a project in a ' +
  `Duo-enabled group:\n${DUO_DEFAULT_NAMESPACE_DOCS_URL}`;

export const DUO_USAGE_QUOTA_EXCEEDED_MESSAGE =
  "You don't have enough GitLab Credits to run GitLab Duo Agent Platform.\n\n" +
  'Contact your administrator to purchase more credits, then try again.';

// The backend prefixes the quota failure message with this marker before returning a 403.
const USAGE_QUOTA_EXCEEDED_MARKER = 'USAGE_QUOTA_EXCEEDED';

// Lets consumers that only see a plain Error (not the typed Duo errors) recognise a Duo
// access message. Kept next to the constants so the coupling stays in one place.
export const isDuoAccessMessage = (message: string | undefined): boolean =>
  message === DUO_NAMESPACE_NOT_ENTITLED_MESSAGE ||
  message === DUO_NO_NAMESPACE_DETECTED_MESSAGE ||
  message === DUO_USAGE_QUOTA_EXCEEDED_MESSAGE;

const parseBody = (body: string | undefined): { error?: unknown; message?: unknown } => {
  let parsed: { error?: unknown; message?: unknown } = {};
  if (body) {
    try {
      parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
    } catch {
      parsed = {};
    }
  }
  return parsed;
};

export type DuoAccessError =
  | { kind: 'no_namespace'; message: typeof DUO_NO_NAMESPACE_DETECTED_MESSAGE }
  | { kind: 'quota_exceeded'; message: typeof DUO_USAGE_QUOTA_EXCEEDED_MESSAGE }
  | { kind: 'not_entitled'; message: typeof DUO_NAMESPACE_NOT_ENTITLED_MESSAGE };

export const classifyDuoAccessError = (
  status: number | undefined,
  body: string | undefined,
): DuoAccessError | undefined => {
  let result: DuoAccessError | undefined;

  if (status === 403) {
    const { error, message } = parseBody(body);

    if (error === 'missing_default_duo_group') {
      result = { kind: 'no_namespace', message: DUO_NO_NAMESPACE_DETECTED_MESSAGE };
    } else if (typeof message === 'string' && message.includes(USAGE_QUOTA_EXCEEDED_MARKER)) {
      result = { kind: 'quota_exceeded', message: DUO_USAGE_QUOTA_EXCEEDED_MESSAGE };
    } else {
      result = { kind: 'not_entitled', message: DUO_NAMESPACE_NOT_ENTITLED_MESSAGE };
    }
  }

  return result;
};
