import { QueryCapture } from 'web-tree-sitter';
import { Logger } from '@gitlab-org/logging';
import { ImportPathType } from './query';
import { getAssociatedImportPath } from './path_extractors/import_path';
import { getRequireImportPath } from './path_extractors/require_import_path';
import { getDynamicImportPath } from './path_extractors/dynamic_import_path';

export { getCaptureIdentifier } from './identifiers/capture_identifiers';
export * from './query';

export const importPathResolvers: Record<
  string,
  { type: ImportPathType; resolver: (c: QueryCapture, logger: Logger) => string | null }
> = {
  'imported-identifier': {
    type: 'import-source',
    resolver: (c, logger) => getAssociatedImportPath(c, logger),
  },
  'namespace-import': {
    type: 'import-source',
    resolver: (c, logger) => getAssociatedImportPath(c, logger),
  },
  'renamed-identifier': {
    type: 'import-source',
    resolver: (c, logger) => getAssociatedImportPath(c, logger),
  },
  'default-import': {
    type: 'import-source',
    resolver: (c, logger) => getAssociatedImportPath(c, logger),
  },
  'require-name': { type: 'require-source', resolver: getRequireImportPath },
  'dynamic-import-name': { type: 'dynamic-import-source', resolver: getDynamicImportPath },
};
