import type { URI } from 'vscode-uri';
import { createInterfaceId } from '@gitlab/needle';
import type { IDocContext } from '../../../../../../../document_transformer_service';

export interface ModuleResolutionContext {
  importPath: string;
  sourceDocumentContext: IDocContext;
  sourceDocumentUri: URI;
}

export interface JavaScriptImportFilePathResolver {
  canResolve(importPath: string): boolean;
  resolveImportPath(resolveContext: ModuleResolutionContext): Promise<URI | null>;
}

export const JavaScriptImportFilePathResolver = createInterfaceId<JavaScriptImportFilePathResolver>(
  'JavaScriptImportFilePathResolver',
);

export abstract class AbstractJavaScriptImportFilePathResolver
  implements JavaScriptImportFilePathResolver
{
  abstract canResolve(importPath: string): boolean;

  abstract resolveImportPath(resolveContext: ModuleResolutionContext): Promise<URI | null>;

  protected isRelativePath(importPath: string): boolean {
    return importPath.startsWith('.') || importPath.startsWith('/');
  }
}
