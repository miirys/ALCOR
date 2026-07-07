interface GitlabInstanceFeatureFlag {
  name: string;
  enabled: boolean;
}

export interface Metadata {
  featureFlags: GitlabInstanceFeatureFlag[];
  version: string;
}
