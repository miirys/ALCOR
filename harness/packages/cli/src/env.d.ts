declare namespace NodeJS {
  interface ProcessEnv {
    // Add all your environment variables here
    GITLAB_BASE_URL?: string;
    GITLAB_OAUTH_TOKEN?: string;
    GITLAB_TOKEN?: string;
    GITLAB_DANGEROUSLY_SKIP_PERMISSIONS?: string;
  }
}
