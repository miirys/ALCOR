import { createCollectionId, Injectable } from '@gitlab/needle';
import type { ImportAIContextItem, ResolvedImportMetadata } from '@gitlab-org/ai-context';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { URI } from 'vscode-uri';
import { DuoCodeSuggestionsContext } from '@gitlab-org/duo-feature-access';
import { parseURIString } from '@gitlab-org/fs';
import {
  CodeSuggestionsAIRequest,
  SuggestionContextProvider,
} from '../../code_suggestions_context_provider';
import { FsClient } from '../../../services/fs/fs';
import {
  DuoProjectAccessChecker,
  DuoProjectStatus,
} from '../../../services/duo_access/project_access_checker';
import { FilePolicyProvider } from '../../context_policies/file_policy';
import { DuoProject } from '../../../services/duo_access/workspace_project_access_cache';
import { OpenTabsService } from '../../../open_tabs/open_tabs_service';
import { type IDocContext } from '../../../document_transformer_service';
import { DISABLED_REASONS } from '../constants';
import { ImportResolver, AbstractImportResolver } from './ast/import_resolver';

const ImportHandlerResolverCollection = createCollectionId(ImportResolver);

const ImportProviderType = 'import' as const;
const ImportProviderIcon = 'import' as const;

@Injectable(SuggestionContextProvider, [
  Logger,
  FsClient,
  ImportHandlerResolverCollection,
  DuoProjectAccessChecker,
  FilePolicyProvider,
  OpenTabsService,
])
export class DefaultImportContextProvider
  implements SuggestionContextProvider<ImportAIContextItem>
{
  readonly type = ImportProviderType;

  #logger: Logger;

  #fsClient: FsClient;

  #importResolvers: AbstractImportResolver[];

  #projectAccessChecker: DuoProjectAccessChecker;

  #policy: FilePolicyProvider;

  #openTabsService: OpenTabsService;

  suggestionsRequiredFeature = DuoCodeSuggestionsContext.Imports;

  constructor(
    logger: Logger,
    fsClient: FsClient,
    importResolvers: AbstractImportResolver[],
    projectAccessChecker: DuoProjectAccessChecker,
    policy: FilePolicyProvider,
    openTabsService: OpenTabsService,
  ) {
    this.#logger = withPrefix(logger, '[ImportContextProvider]');
    this.#fsClient = fsClient;
    this.#importResolvers = importResolvers;
    this.#projectAccessChecker = projectAccessChecker;
    this.#policy = policy;
    this.#openTabsService = openTabsService;
  }

  /**
   * Analyzes imports in the given document and provides context for code suggestions.
   * This method implements a multi-step import analysis pipeline:
   *
   * 1. Language Handler Selection:
   *    - Validates if language info exists and finds appropriate import resolver
   *    - Each resolver declares supported languages (JS/TS/TSX/Vue etc.)
   *
   * 2. AST Captures:
   *    - Uses Tree-sitter to query the document's AST via the language's query
   *
   * 3. Import Metadata Extraction:
   *    - Processes Tree-sitter captures to extract normalized import data
   *    - Groups imports by their source module
   *
   * 4. Path Resolution:
   *    - Resolves import strings to actual file system URIs
   */
  async searchSuggestionContextItems(
    aiContextSearchRequest: CodeSuggestionsAIRequest,
  ): Promise<ImportAIContextItem[]> {
    this.#logger.debug('searching imports');
    const searchRequest = aiContextSearchRequest;
    const { iDocContext, treeAndLanguage } = searchRequest;
    if (!treeAndLanguage?.languageInfo.name) {
      return [];
    }

    this.#logger.debug(
      `Getting context for code suggestions for language: ${treeAndLanguage?.languageInfo.name}`,
    );

    const importResolver = this.#importResolvers.find((resolver) =>
      resolver.enabledForLanguage(treeAndLanguage?.languageInfo.name),
    );
    if (!importResolver) {
      this.#logger.debug(
        `No import resolver found for language: ${treeAndLanguage?.languageInfo.name}`,
      );
      return [];
    }

    const captures = treeAndLanguage.language
      .query(importResolver.getTreeSitterQuery())
      .captures(treeAndLanguage.tree.rootNode);

    const importPathsToMetadata = await importResolver.getImportMetadataByPath({
      captures,
      sourceDocumentContext: iDocContext,
      treeAndLanguage,
    });
    const sourceDocumentUri = parseURIString(iDocContext.uri);

    const resolvedImportMetadataArray = (
      await Promise.all(
        Array.from(importPathsToMetadata.entries()).map(async ([importPath, metadata]) => {
          const resolvedImportPath = await importResolver.resolveImportPath({
            importPath,
            sourceDocumentContext: iDocContext,
            sourceDocumentUri,
          });
          return {
            ...metadata,
            resolvedImportPath,
          };
        }),
      )
    ).filter((item): item is ResolvedImportMetadata => item.resolvedImportPath !== null);

    const contextItems = await Promise.all(
      resolvedImportMetadataArray.map(async (metadata) => {
        return this.#createContextItem(metadata, iDocContext);
      }),
    );
    this.#logger.debug(`Found ${contextItems.length} import context items`);
    return contextItems;
  }

  async #createContextItem(
    metadata: ResolvedImportMetadata,
    iDocContext: IDocContext,
  ): Promise<ImportAIContextItem> {
    const { resolvedImportPath: uri } = metadata;
    const [disabledReasons, project] = await Promise.all([
      this.#getDisabledReasons(uri, iDocContext),
      this.#getProjectInfo(uri, iDocContext),
    ]);

    return {
      id: uri.toString(),
      category: 'file' as const,
      metadata: {
        title: uri.fsPath,
        enabled: disabledReasons.length === 0,
        disabledReasons,
        icon: ImportProviderIcon,
        subType: ImportProviderType,
        subTypeLabel: 'Imported file',
        secondaryText: uri.fsPath,
        project: project?.namespaceWithPath ?? 'not a GitLab project',
        ...metadata,
      },
    };
  }

  async #getDisabledReasons(uri: URI, iDocContext: IDocContext): Promise<string[]> {
    const disabledReasons: string[] = [];

    if (iDocContext.workspaceFolder) {
      const { status } = this.#projectAccessChecker.checkProjectStatus(
        uri.toString(),
        iDocContext.workspaceFolder,
      );
      if (status === DuoProjectStatus.DuoDisabled) {
        this.#logger.debug(`duo features are not enabled for ${uri.toString()}`);
        disabledReasons.push(DISABLED_REASONS.DUO_PROJECT_DISABLED);
      }
    }

    const { enabled: policyEnabled, disabledReasons: policyReasons = [] } =
      await this.#policy.isContextItemAllowed(uri.fsPath);
    if (!policyEnabled) {
      disabledReasons.push(...policyReasons);
    }

    return disabledReasons;
  }

  async #getProjectInfo(uri: URI, iDocContext: IDocContext): Promise<DuoProject | undefined> {
    if (!iDocContext.workspaceFolder) {
      return undefined;
    }

    const { project } = this.#projectAccessChecker.checkProjectStatus(
      uri.toString(),
      iDocContext.workspaceFolder,
    );
    return project;
  }

  #getFileContent(uri: URI): Promise<string> {
    // check if the imported file already exists in memory to avoid disk I/O
    const openFile = this.#openTabsService.openTabsCache.get(uri.fsPath);
    if (openFile) {
      return Promise.resolve(`${openFile.prefix}${openFile.suffix}`);
    }

    return this.#fsClient.promises.readFile(uri.fsPath).then((buffer) => buffer.toString('utf-8'));
  }

  async addSelectedContextItem(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async removeSelectedContextItem(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async clearSelectedContextItems(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async getSelectedContextItems(): Promise<ImportAIContextItem[]> {
    return [];
  }

  async addContentToItems(aiContextItems: ImportAIContextItem[]): Promise<ImportAIContextItem[]> {
    return Promise.all(
      aiContextItems.map(async (item) => {
        return {
          ...item,
          content: await this.#getFileContent(item.metadata.resolvedImportPath),
        };
      }),
    );
  }

  async getItemWithContent(item: ImportAIContextItem): Promise<ImportAIContextItem> {
    return item;
  }
}
