import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Utils } from 'vscode-uri';
import {
  type OpenTabAIContextItem,
  type AIContextPolicyResponse,
  BINARY_FILE_DISABLED_REASON,
  type DuoChatAIRequest,
  AbstractAIContextProvider,
} from '@gitlab-org/ai-context';
import { DuoFeature, DuoCodeSuggestionsContext } from '@gitlab-org/duo-feature-access';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { parseURIString } from '@gitlab-org/fs';
import { log } from '../../../log';
import { OpenTabsService } from '../../../open_tabs/open_tabs_service';
import { DuoProjectAccessChecker } from '../../../services/duo_access';
import { DuoProjectStatus } from '../../../services/duo_access/project_access_checker';
import type { DuoProject } from '../../../services/duo_access/workspace_project_access_cache';
import { isBinaryContent } from '../../../utils/binary_content';
import { AbstractAIContextPolicyProvider } from '../../ai_context_policy_provider';
import { FilePolicyProvider } from '../../context_policies/file_policy';
import { DuoExclusionFilePolicyProvider } from '../../context_policies/duo_exclusion_file_policy';
import { AIContextProvider } from '../..';
import {
  CodeSuggestionsAIRequest,
  SuggestionContextProvider,
} from '../../code_suggestions_context_provider';
import { type IDocContext } from '../../../document_transformer_service';
import { DISABLED_REASONS } from '../constants';

export const duoNotEnabledLog = (uri: string) => {
  return `duo features are not enabled for ${uri}`;
};

export interface OpenTabContextProvider
  extends AbstractAIContextProvider<OpenTabAIContextItem>,
    SuggestionContextProvider<OpenTabAIContextItem> {}

@Service({
  dependencies: [
    Logger,
    DuoProjectAccessChecker,
    FilePolicyProvider,
    DuoExclusionFilePolicyProvider,
    OpenTabsService,
  ],
  lifetime: ServiceLifetime.Transient,
})
@Implements(AIContextProvider)
@Implements(SuggestionContextProvider)
export class DefaultOpenTabContextProvider
  extends AbstractAIContextProvider<OpenTabAIContextItem>
  implements OpenTabContextProvider
{
  #projectAccessChecker: DuoProjectAccessChecker;

  #openTabsService: OpenTabsService;

  #policies: AbstractAIContextPolicyProvider[];

  chatRequiredFeature = DuoFeature.IncludeFileContext;

  suggestionsRequiredFeature = DuoCodeSuggestionsContext.OpenTabs;

  constructor(
    logger: Logger,
    projectAccessChecker: DuoProjectAccessChecker,
    filePolicy: FilePolicyProvider,
    duoContextExclusionPolicy: DuoExclusionFilePolicyProvider,
    openTabsService: OpenTabsService,
  ) {
    super('open_tab', withPrefix(logger, '[OpenTabContextProvider]'));
    this.#policies = [filePolicy, duoContextExclusionPolicy];
    this.#projectAccessChecker = projectAccessChecker;
    this.#openTabsService = openTabsService;

    this.canItemBeAdded = async (
      contextItem: OpenTabAIContextItem,
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

  async searchContextItems(query: DuoChatAIRequest): Promise<OpenTabAIContextItem[]> {
    if (query.query.trim() !== '') {
      return [];
    }
    return this.#getOpenFiles();
  }

  async searchSuggestionContextItems(
    query: CodeSuggestionsAIRequest,
  ): Promise<OpenTabAIContextItem[]> {
    return this.#getOpenFiles(query.iDocContext);
  }

  async #getOpenFiles(iDocContext?: IDocContext): Promise<OpenTabAIContextItem[]> {
    const openTabs = this.#openTabsService.mostRecentTabs({
      context: iDocContext,
      includeCurrentFile: !iDocContext,
    });

    log.debug(`[OpenTabContextProvider] context item search for ${this.type}`);
    const promises = openTabs.map(async (openTab) => {
      let project: DuoProject | undefined;
      const disabledReasons: string[] = [];

      const fileContent = openTab.prefix + openTab.suffix;
      if (isBinaryContent(fileContent)) {
        disabledReasons.push(BINARY_FILE_DISABLED_REASON);
      }

      if (openTab.workspaceFolder) {
        const { project: projectFromChecker, status } =
          this.#projectAccessChecker.checkProjectStatus(openTab.uri, openTab.workspaceFolder);
        project = projectFromChecker;
        if (status === DuoProjectStatus.DuoDisabled) {
          log.debug(duoNotEnabledLog(openTab.uri));
          disabledReasons.push(DISABLED_REASONS.DUO_PROJECT_DISABLED);
        }
      }

      const policyResults = await Promise.all(
        this.#policies.map((policy) => policy.isContextItemAllowed(openTab.fileRelativePath)),
      );

      const disabledPolicies = policyResults.filter((result) => !result.enabled);
      if (disabledPolicies.length > 0) {
        disabledReasons.push(...disabledPolicies.flatMap((policy) => policy.disabledReasons || []));
      }

      const projectPath = project?.namespaceWithPath;

      const item = {
        id: openTab.uri,
        category: 'file' as const,
        metadata: {
          languageId: openTab.languageId,
          title: Utils.basename(parseURIString(openTab.uri)),
          project: projectPath ?? 'not a GitLab project',
          enabled: disabledReasons.length === 0,
          disabledReasons,
          icon: 'document',
          secondaryText: openTab.fileRelativePath,
          subType: 'open_tab' as const,
          subTypeLabel: 'Project file',
          relativePath: openTab.fileRelativePath,
          workspaceFolder: openTab.workspaceFolder ?? { name: '', uri: '' },
          lastAccessed: openTab.lastAccessed,
          lastModified: openTab.lastModified,
          byteSize: openTab.byteSize,
        },
      } satisfies OpenTabAIContextItem;

      log.debug(`[OpenTabContextProvider] open tab context item ${item.id} was found`);
      return item;
    });

    return Promise.all(promises);
  }

  async retrieveContextItemsWithContent(): Promise<OpenTabAIContextItem[]> {
    const items = await this.getSelectedContextItems();

    const itemsWithContentPromises = items.map((document) => {
      log.debug(
        `[OpenTabContextProvider] open tab context item ${document.id} was retrieved with content`,
      );
      return this.getItemWithContent(document);
    });

    return Promise.all(itemsWithContentPromises);
  }

  async addContentToItems(aiContextItems: OpenTabAIContextItem[]): Promise<OpenTabAIContextItem[]> {
    return Promise.all(aiContextItems.map((item) => this.getItemWithContent(item)));
  }

  async getItemWithContent(item: OpenTabAIContextItem): Promise<OpenTabAIContextItem> {
    const itemFile = this.#openTabsService.openTabsCache.get(item.id);
    if (itemFile) {
      return {
        ...item,
        content: itemFile.prefix + itemFile.suffix,
      };
    }

    log.error(`[OpenTabContextProvider] failed to get content for item "${item.id}"`);
    return item;
  }
}
