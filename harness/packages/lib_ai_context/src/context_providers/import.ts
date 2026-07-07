import { URI } from 'vscode-uri';
import { SyntaxNode } from 'web-tree-sitter';
import type { IDocContext } from '@gitlab-org/document';
import type { AIContextItem, AIContextItemMetadata } from '../ai_context_item';
import type { AIContextProviderType } from './ai_context_provider';

export type TreeSitterLanguageName =
  | 'bash'
  | 'c'
  | 'cpp'
  | 'c_sharp'
  | 'css'
  | 'go'
  | 'html'
  | 'java'
  | 'javascript'
  | 'json'
  | 'kotlin'
  | 'powershell'
  | 'python'
  | 'ruby'
  | 'rust'
  | 'scala'
  | 'typescript'
  | 'tsx'
  | 'vue'
  | 'json'
  | 'yaml';

type DefaultImportPathType = string;
type DefaultImportIdentifierType = string;

/*
 * This is the metadata for a single import identifier, which can be a part of a larger import statement.
 *
 * Example:
 * ```typescript
 * import { foo } from 'bar';
 * ```
 *
 * In this example, `foo` is the import identifier.
 * The import path is `bar`.
 * The language name is `typescript`.
 * The import type is `named`.
 * The identifier is `foo`.
 */
export type ImportIdentifier<
  TImportPathType = DefaultImportPathType,
  TImportIdentifierType = DefaultImportIdentifierType,
> = {
  /**
   * The node that contains the import identifier.
   * This should refer to the node in memory
   * if possible. You should always use
   * `web-tree-sitter` to get the node.
   */
  node: SyntaxNode;
  /**
   * The import path for the import.
   */
  importPath: string;

  /**
   * The type of the import.
   * This is used to strongly type the import type you expect to get from the query.
   */
  importPathType: TImportPathType;
  /**
   * The type of the import identifier.
   * This is used to strongly type the identifier you expect to get from the query.
   */
  identifierType: TImportIdentifierType;
  /**
   * The original identifier for the import.
   * This is optional because some imports do not have identifiers.
   */
  identifier?: string;
  /**
   * An alias for the import identifier that
   * points to the original identifier.
   *
   * This may not be applicable for all languages.
   */
  alias?: string;
};

/**
 * This is the metadata for a single import statement.
 *
 * Example:
 * ```typescript
 * import { foo } from 'bar';
 * ```
 *
 * In this example, the source document URI is `file:///path/to/file.ts`.
 * The import path is `bar`.
 * The language name is `typescript`.
 * The import identifiers are `foo`.
 *
 * The import identifiers are optional because some imports do not have identifiers.
 * For example, `import 'bar';` does not have any identifiers.
 */
export type ImportMetadata<
  TImportType = DefaultImportPathType,
  TIdentifierType = DefaultImportIdentifierType,
> = {
  sourceDocumentContext: IDocContext;
  importPath: string;
  languageName: TreeSitterLanguageName;
  importIdentifiers: ImportIdentifier<TImportType, TIdentifierType>[];
};

export type ResolvedImportMetadata<
  TImportType = DefaultImportPathType,
  TIdentifierType = DefaultImportIdentifierType,
> = {
  resolvedImportPath: URI;
} & ImportMetadata<TImportType, TIdentifierType>;

export type ImportAIContextItem = AIContextItem & {
  category: 'file';
  metadata: AIContextItemMetadata & {
    subType: AIContextProviderType;
    enabled: boolean;
    project?: string;
  } & ResolvedImportMetadata;
};
