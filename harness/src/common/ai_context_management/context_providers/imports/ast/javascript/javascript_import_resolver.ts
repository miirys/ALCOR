import { QueryCapture } from 'web-tree-sitter';
import { URI } from 'vscode-uri';
import { collection, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { TreeSitterLanguageName } from '../../../../../tree_sitter/languages';
import { TreeAndLanguage } from '../../../../../tree_sitter';
import { type IDocContext } from '../../../../../document_transformer_service';
import { AbstractImportResolver, ImportResolver } from '../import_resolver';
import { QueryCaptureWithNames } from '../utils';
import { JavaScriptImportFilePathResolver } from './ast/import_file_path_resolver';
import {
  ESImportMetadata,
  ESImportIdentifier,
  treeSitterQuery,
  captureMap,
  ImportIdentifierType,
  ImportPathType,
  getCaptureIdentifier,
  importPathResolvers,
} from './ast';

type ImportGroups = Map<
  string,
  {
    importPath: string;
    importPathType: ImportPathType;
    captures: {
      capture: QueryCapture;
      identifierType: ImportIdentifierType;
    }[];
  }
>;

@Injectable(ImportResolver, [Logger, collection(JavaScriptImportFilePathResolver)])
export class JavascriptImportResolver extends AbstractImportResolver<
  typeof captureMap,
  ImportPathType,
  ImportIdentifierType
> {
  #logger: Logger;

  #importPathFileResolvers: JavaScriptImportFilePathResolver[];

  constructor(logger: Logger, importPathFileResolvers: JavaScriptImportFilePathResolver[]) {
    super();
    this.#logger = withPrefix(logger, '[JavascriptImportResolver]');
    this.#importPathFileResolvers = importPathFileResolvers;
  }

  supportedLanguages: TreeSitterLanguageName[] = ['javascript', 'typescript', 'tsx'];

  getTreeSitterQuery(): string {
    return treeSitterQuery;
  }

  async getImportMetadataByPath({
    captures,
    sourceDocumentContext,
    treeAndLanguage,
  }: {
    captures: QueryCaptureWithNames<typeof captureMap>[];
    sourceDocumentContext: IDocContext;
    treeAndLanguage: TreeAndLanguage;
  }): Promise<Map<string, ESImportMetadata>> {
    // Group captures by their import path to handle multiple imports from same source
    const importGroups: ImportGroups = new Map();

    captures.forEach((capture) => {
      const parentNode = capture.node.parent;
      if (!parentNode) {
        // Skip if no parent node
        return;
      }

      const importPathInfo = this.#getSourceCapture(capture);
      if (importPathInfo) {
        const { importPath, importPathType } = importPathInfo;
        if (!importGroups.has(importPath)) {
          importGroups.set(importPath, {
            importPath,
            importPathType,
            captures: [],
          });
        }
        // we don't need to further process the capture to extract identifiers
        // if it's a source capture
        return;
      }

      const { importPath, importPathType } = this.#getImportPathAndType(capture);

      if (importPath && importPathType) {
        if (!importGroups.has(importPath)) {
          importGroups.set(importPath, {
            importPath,
            importPathType,
            captures: [],
          });
        }
        importGroups.get(importPath)?.captures.push({
          capture,
          identifierType: capture.name as ImportIdentifierType,
        });
      }
    });

    return this.#combineIdentifiersAndPaths(sourceDocumentContext, treeAndLanguage, importGroups);
  }

  /**
   * We want to capture all import paths we encounter
   * We will later use this to check if any import paths are side effect imports
   * Eg. `import './foo'` or empty import `import {} from 'foo'`
   */
  #getSourceCapture(capture: QueryCapture): {
    importPath: string;
    importPathType: ImportPathType;
  } | null {
    if (
      capture.name === 'import-source' ||
      capture.name === 'require-source' ||
      capture.name === 'dynamic-import-source'
    ) {
      return {
        importPath: capture.node.text,
        importPathType: capture.name,
      };
    }
    return null;
  }

  /**
   * This actually extracts the import path and type from the capture
   * We use this to populate the import metadata map
   */
  #getImportPathAndType(capture: QueryCapture): {
    importPath: string | null;
    importPathType: ImportPathType | null;
  } {
    const entry = importPathResolvers[capture.name];
    if (entry) {
      return {
        importPath: entry.resolver(capture, this.#logger),
        importPathType: entry.type,
      };
    }

    this.#logger.debug(`Unknown capture type: ${capture.name}`);
    return { importPath: null, importPathType: null };
  }

  #combineIdentifiersAndPaths(
    sourceDocumentContext: IDocContext,
    treeAndLanguage: TreeAndLanguage,
    importGroups: ImportGroups,
  ): Map<string, ESImportMetadata> {
    const importPathsToMetadata = new Map<string, ESImportMetadata>();

    for (const group of importGroups.values()) {
      const importPath = group.importPath.replace(/['"]/g, '');
      const uniqueIdentifiers = new Map<string, ESImportIdentifier>();

      group.captures.forEach((c) => {
        const identifier = getCaptureIdentifier(c.capture);
        if (!identifier) return;

        // Use the original identifier as the key, but preserve the alias information
        uniqueIdentifiers.set(identifier.originalIdentifier, {
          importPath,
          node: c.capture.node,
          importPathType: group.importPathType,
          identifierType: c.identifierType,
          identifier: identifier.originalIdentifier,
          alias: identifier.alias ?? undefined,
        });
      });

      const esImportMetadata = {
        importPath,
        importIdentifiers: Array.from(uniqueIdentifiers.values()),
        sourceDocumentContext,
        languageName: treeAndLanguage.languageInfo.name,
      } satisfies ESImportMetadata;

      importPathsToMetadata.set(importPath, esImportMetadata);
    }

    return importPathsToMetadata;
  }

  async resolveImportPath({
    importPath: rawImportPath,
    sourceDocumentUri,
    sourceDocumentContext,
  }: {
    importPath: string;
    sourceDocumentContext: IDocContext;
    sourceDocumentUri: URI;
  }): Promise<URI | null> {
    // Remove quotes from import path if present
    const importPath = rawImportPath.replace(/['"]/g, '');

    const resolvers = this.#importPathFileResolvers.filter((resolver) =>
      resolver.canResolve(importPath),
    );
    if (!resolvers.length) {
      this.#logger.debug(`No import path file resolver found for "${importPath}"`);
      return null;
    }

    const performanceKey = `JavaScriptImportResolver_resolveImportPath_${sourceDocumentUri}_${importPath}`;
    try {
      performance.mark(`mark_${performanceKey}`);

      const resolutions = resolvers.map((resolver) =>
        resolver.resolveImportPath({
          importPath,
          sourceDocumentUri,
          sourceDocumentContext,
        }),
      );

      const result = await Promise.any(resolutions);

      const measure = performance.measure(`measure_${performanceKey}`, `mark_${performanceKey}`);
      this.#logger.debug(
        `Resolved "${importPath}" to "${result}" in ${measure.duration.toFixed(2)}ms`,
      );

      return result;
    } catch (error) {
      this.#logger.error(`Error resolving import path "${importPath}"`, error);
    } finally {
      performance.clearMarks(`mark_${performanceKey}`);
      performance.clearMeasures(`measure_${performanceKey}`);
    }

    return null;
  }
}
