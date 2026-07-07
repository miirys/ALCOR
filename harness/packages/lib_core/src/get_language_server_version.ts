export function getLanguageServerVersion(): string {
  // This variable is injected by the bundler (esbuild/bun)
  // @ts-ignore
  return BUNDLER_INJECTED_GITLAB_LANGUAGE_SERVER_VERSION;
}
