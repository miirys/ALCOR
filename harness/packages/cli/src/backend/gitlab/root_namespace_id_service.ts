import { Logger, withPrefix } from '@gitlab-org/logging';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { ProjectDetails, UserService, tryParseGitLabGidToString } from '@gitlab-org/core';
import { GitLabParsedOptions } from './gitlab_parsed_options';

/**
 * Resolves the root namespace ID used for model resolution and workflow
 * metadata, from multiple sources in priority order.
 */
@Service({
  dependencies: [Logger, GitLabParsedOptions, UserService],
  lifetime: ServiceLifetime.Singleton,
})
export class RootNamespaceIdService {
  #logger: Logger;

  #backendOpts: GitLabParsedOptions;

  #userService: UserService;

  constructor(logger: Logger, backendOpts: GitLabParsedOptions, userService: UserService) {
    this.#logger = withPrefix(logger, '[RootNamespaceIdService]');
    this.#backendOpts = backendOpts;
    this.#userService = userService;
  }

  /**
   * Resolves the root namespace ID from multiple sources in priority order:
   *
   * 1. `--duo-workflow-metadata` JSON (explicitly carries rootNamespaceId in CI mode)
   * 2. `--duo-workflow-namespace-id` flag (in headless mode the namespace IS the root namespace)
   * 3. Project details (GraphQL lookup)
   * 4. User's configured default Duo namespace (network fallback)
   *
   * May make a network call as a last resort (the user default namespace).
   * Always returns a string; returns `''` if no namespace can be determined.
   *
   * `projectDetails` should be pre-fetched by the caller — passing it in here
   * avoids a redundant network fetch since the caller already needs it.
   */
  async resolve(projectDetails?: ProjectDetails): Promise<string> {
    const detected = this.#detectFromKnownSources(projectDetails);
    if (detected) {
      this.#logger.debug(`Using detected project root namespace id ${detected} for models`);
      return detected;
    }

    const user = await this.#userService.getUser();
    const userDefault = user.duoDefaultNamespaceId ?? '';
    if (userDefault) {
      this.#logger.debug(
        `No project root namespace; using user's default Duo namespace id ${userDefault} for models`,
      );
      return userDefault;
    }

    this.#logger.warn(
      'No project root namespace and no default Duo namespace configured; models may be unavailable. Set a default Duo namespace in your GitLab preferences.',
    );
    return '';
  }

  /**
   * Resolves the root namespace ID from sources already known without making
   * a network call. Returns `''` when none are available.
   */
  #detectFromKnownSources(projectDetails?: ProjectDetails): string {
    // From --duo-workflow-metadata JSON (explicitly carries rootNamespaceId in CI mode)
    const metadataRootNs = this.#backendOpts.duoWorkflowMetadata?.rootNamespaceId;
    if (typeof metadataRootNs === 'string' && metadataRootNs) return metadataRootNs;

    // From --duo-workflow-namespace-id flag (in headless mode the namespace IS the root namespace)
    if (this.#backendOpts.duoWorkflowNamespaceId) return this.#backendOpts.duoWorkflowNamespaceId;

    // From project details (GraphQL lookup)
    const fromProject = tryParseGitLabGidToString(projectDetails?.namespace.rootNamespace?.id);
    if (fromProject) return fromProject;

    return '';
  }
}
