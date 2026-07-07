import { createInterfaceId } from '@gitlab/needle';
import { URI } from 'vscode-uri';
import type { ImportMetadata, ResolvedImportMetadata } from '@gitlab-org/ai-context';
import { TreeSitterLanguageName } from '../../../../tree_sitter/languages';
import { type IDocContext } from '../../../../document_transformer_service';
import { TreeAndLanguage } from '../../../../tree_sitter';
import { CaptureNameMap, QueryCaptureWithNames } from './utils';

type DefaultImportPathType = string;
type DefaultImportIdentifierType = string;

export abstract class AbstractImportResolver<
  /*
   * This is the type of the captures that are returned by the TreeSitter query.
   * You should use this to strongly type the captures you expect to get from the query.
   */
  T extends CaptureNameMap = CaptureNameMap,
  /*
   * This is the type of the import path for the import.
   * This is used to strongly type the import path you expect to get from the query.
   */
  TImportType = DefaultImportPathType,
  /**
   * This is the type of the identifier for the import.
   * This is used to strongly type the identifier you expect to get from the query.
   */
  TIdentifierType = DefaultImportIdentifierType,
> {
  /**
   * @returns the languages this import resolver supports
   */
  abstract readonly supportedLanguages: TreeSitterLanguageName[];

  /**
   * @returns A TreeSitter query that will capture the import paths in the source document
   * This is implemented for each language.
   */
  abstract getTreeSitterQuery(): string;

  /**
   * This is implemented for each language.
   * You can use the captures to get the import paths and then map them to the ImportMetadata
   *
   * If a document contains duplicate imports, the caller will expect
   * the same import path to be returned for each import.
   */
  abstract getImportMetadataByPath({
    captures,
    sourceDocumentContext,
    treeAndLanguage,
  }: {
    captures: QueryCaptureWithNames<T>[];
    sourceDocumentContext: IDocContext;
    treeAndLanguage: TreeAndLanguage;
  }): Promise<Map<string, ImportMetadata<TImportType, TIdentifierType>>>;

  /**
   * This is implemented for each language.
   * You can use the import path to resolve the import path to a URI.
   *
   * This method can access the file system, `RepositoryService`, or any other service
   * to resolve the import path to a URI for a given source document.
   */
  abstract resolveImportPath({
    importPath,
    sourceDocumentContext,
    sourceDocumentUri,
  }: {
    importPath: string;
    sourceDocumentContext: IDocContext;
    sourceDocumentUri: URI;
  }): Promise<URI | null>;

  /**
   * This is a helper method to check if the import resolver is enabled for a given language.
   *
   * This is used by the ImportContextProvider to determine if the import resolver should be used for a given language.
   */
  enabledForLanguage(languageName: TreeSitterLanguageName): boolean {
    return this.supportedLanguages.includes(languageName);
  }

  /**
   * This is an optional method that can be implemented for each language.
   *
   * This allows the specific import resolver to override the default behavior of the above methods.
   */
  resolveImports?({
    iDocContext,
    treeAndLanguage,
  }: {
    iDocContext: IDocContext;
    treeAndLanguage: TreeAndLanguage;
  }): Promise<Map<string, ResolvedImportMetadata<TImportType, TIdentifierType>>>;
}

// Generic AIContextProvider interface ID cannot handle contravariant parameters and covariant returns properly in DI registration
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ImportResolver = createInterfaceId<AbstractImportResolver<any>>('ImportResolver');
