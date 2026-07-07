import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { URI, Utils } from 'vscode-uri';
import { filter } from 'fuzzaldrin-plus';
import {
  AbstractAIContextProvider,
  type AIContextPolicyResponse,
  BINARY_FILE_DISABLED_REASON,
  type DuoChatAIRequest,
  type LocalFileAIContextItem,
} from '@gitlab-org/ai-context';
import { RepositoryFile, RepositoryService } from '@gitlab-org/repositories';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { getRelativePath } from '@gitlab-org/fs';
import { DuoProjectAccessChecker } from '../../services/duo_access';
import { log } from '../../log';
import { AIContextProvider } from '..';
import { DuoProjectStatus } from '../../services/duo_access/project_access_checker';
import { FsClient } from '../../services/fs/fs';
import { asyncDebounce, type AsyncDebouncedFunction } from '../../utils/async_debounce';
import { isBinaryFile } from '../../utils/binary_content';
import { AbstractAIContextPolicyProvider } from '../ai_context_policy_provider';
import { FilePolicyProvider } from '../context_policies/file_policy';
import { DuoExclusionFilePolicyProvider } from '../context_policies/duo_exclusion_file_policy';
import { DISABLED_REASONS } from './constants';

interface LocalFilesContextProvider extends AbstractAIContextProvider<LocalFileAIContextItem> {}

// TODO: Make this configurable
// https://gitlab.com/gitlab-org/gitlab/-/issues/490602
const MAX_RESULTS = 100;

@Service({
  dependencies: [
    Logger,
    RepositoryService,
    DuoProjectAccessChecker,
    FsClient,
    FilePolicyProvider,
    DuoExclusionFilePolicyProvider,
  ],
  lifetime: ServiceLifetime.Transient,
})
@Implements(AIContextProvider)
export class DefaultLocalFileContextProvider
  extends AbstractAIContextProvider<LocalFileAIContextItem>
  implements LocalFilesContextProvider
{
  #repositoryService: RepositoryService;

  #projectAccessChecker: DuoProjectAccessChecker;

  #fsClient: FsClient;

  #policies: AbstractAIContextPolicyProvider[];

  #debouncedSearchLocalFiles: AsyncDebouncedFunction<
    (query: DuoChatAIRequest) => Promise<LocalFileAIContextItem[]>
  >;

  chatRequiredFeature = DuoFeature.IncludeFileContext;

  constructor(
    logger: Logger,
    repositoryService: RepositoryService,
    projectAccessChecker: DuoProjectAccessChecker,
    fsClient: FsClient,
    filePolicy: FilePolicyProvider,
    duoContextExclusionPolicy: DuoExclusionFilePolicyProvider,
  ) {
    super('local_file_search', withPrefix(logger, '[LocalFileContextProvider]'));
    this.#repositoryService = repositoryService;
    this.#projectAccessChecker = projectAccessChecker;
    this.#fsClient = fsClient;
    this.#policies = [filePolicy, duoContextExclusionPolicy];
    this.#debouncedSearchLocalFiles = asyncDebounce(this.#searchLocalFiles.bind(this), 50);

    this.canItemBeAdded = async (
      contextItem: LocalFileAIContextItem,
    ): Promise<AIContextPolicyResponse> => {
      const policyResults = await Promise.all(
        this.#policies.map((policy) =>
          policy.isContextItemAllowed(contextItem.metadata.relativePath ?? ''),
        ),
      );

      // If any policy disables the item, it should be disabled
      const disabledPolicies = policyResults.filter((result) => !result.enabled);
      if (disabledPolicies.length > 0) {
        const disabledReasons = disabledPolicies.flatMap((policy) => policy.disabledReasons || []);
        return {
          enabled: false,
          disabledReasons,
        };
      }

      return {
        enabled: true,
      };
    };
  }

  async searchContextItems(query: DuoChatAIRequest): Promise<LocalFileAIContextItem[]> {
    if (query.query.trim() === '') {
      return [];
    }
    return this.#debouncedSearchLocalFiles(query);
  }

  /**
   * Note: this a search for local files across *all* workspace folders.
   * TODO: all the client to call a single workspace folder
   */
  async #searchLocalFiles(query: DuoChatAIRequest): Promise<LocalFileAIContextItem[]> {
    // since we are searching across multiple workspace folders, we need to collect all the files in a map
    // with the file URI as the key. This will deduplicate the files across workspace folders.
    const allFilesMap: Map<string, RepositoryFile> = new Map();
    for (const folder of query?.workspaceFolders ?? []) {
      const repositoryFiles = this.#repositoryService.getCurrentFilesForWorkspace(folder.uri, {
        excludeGitFolder: true,
        excludeIgnored: true,
      });
      for (const file of repositoryFiles) {
        allFilesMap.set(file.uri.fsPath, file);
      }
    }

    log.info(`[LocalFilesContextProvider] ${allFilesMap.size} total files`);

    const fileNames = Array.from(allFilesMap.keys());
    const results = filter(fileNames, query.query, { maxResults: MAX_RESULTS });
    log.info(
      `[LocalFilesContextProvider] Found ${results.length} results. Max allowed: ${MAX_RESULTS}`,
    );

    const itemPromises = results.map(async (result): Promise<LocalFileAIContextItem | null> => {
      const file = allFilesMap.get(result);

      if (!file) return null;

      const disabledReasons: string[] = [];

      const isBinary = await isBinaryFile(file.uri, this.#fsClient);
      if (isBinary) {
        disabledReasons.push(BINARY_FILE_DISABLED_REASON);
      }

      const { project: projectFromChecker, status } = this.#projectAccessChecker.checkProjectStatus(
        file.uri.toString(),
        file.workspaceFolder,
      );
      if (status === DuoProjectStatus.DuoDisabled) {
        disabledReasons.push(DISABLED_REASONS.DUO_PROJECT_DISABLED);
      }

      const projectPath = projectFromChecker?.namespaceWithPath;
      const fileRelativePath = getRelativePath(URI.parse(file.workspaceFolder.uri), file.uri);

      const policyResults = await Promise.all(
        this.#policies.map((policy) => policy.isContextItemAllowed(fileRelativePath)),
      );

      const disabledPolicies = policyResults.filter((policyResult) => !policyResult.enabled);
      if (disabledPolicies.length > 0) {
        disabledReasons.push(...disabledPolicies.flatMap((policy) => policy.disabledReasons || []));
      }

      return {
        id: file.uri.toString(),
        category: 'file' as const,
        metadata: {
          title: Utils.basename(file.uri),
          enabled: disabledReasons.length === 0,
          disabledReasons,
          project: projectPath ?? 'not a GitLab project',
          icon: 'document',
          secondaryText: fileRelativePath,
          subType: 'local_file_search',
          subTypeLabel: 'Project file',
          relativePath: fileRelativePath,
          workspaceFolder: file.workspaceFolder,
        },
      };
    });

    return (await Promise.all(itemPromises)).filter(
      (item): item is LocalFileAIContextItem => item !== null,
    );
  }

  async retrieveContextItemsWithContent(): Promise<LocalFileAIContextItem[]> {
    const items = await this.getSelectedContextItems();

    const itemsWithContentPromises = items.map(async (item) => {
      return this.getItemWithContent(item);
    });

    return Promise.all(itemsWithContentPromises);
  }

  async getItemWithContent(item: LocalFileAIContextItem): Promise<LocalFileAIContextItem> {
    const { readFile } = this.#fsClient.promises;
    const content = (await readFile(URI.parse(item.id).fsPath)).toString('utf-8');
    return {
      ...item,
      content,
    };
  }
}
