const SAAS_INSTANCE_URL = 'https://gitlab.com';
const SAAS_DOMAIN = 'gitlab.com';

export enum GitlabRealm {
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  saas = 'saas',
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  selfManaged = 'self-managed',
}

export function getGitlabRealm(baseUrl: string): GitlabRealm {
  try {
    const { hostname } = new URL(baseUrl);

    return hostname.endsWith(SAAS_DOMAIN) ? GitlabRealm.saas : GitlabRealm.selfManaged;
  } catch {
    // If URL parsing fails, fall back to string comparison
    return baseUrl.startsWith(SAAS_INSTANCE_URL) ? GitlabRealm.saas : GitlabRealm.selfManaged;
  }
}
