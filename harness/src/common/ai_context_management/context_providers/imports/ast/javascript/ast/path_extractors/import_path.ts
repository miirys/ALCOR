import { Logger } from '@gitlab-org/logging';
import { QueryCapture } from 'web-tree-sitter';

/**
 * Basic traversal to find the import path for a named import statement
 *
 * An example tree may look like this:
 * ```
 * (import_statement
 *  (import_clause
 *    (named_imports
 *      (import_specifier
 *        name: (identifier)
 *        alias: (identifier)?)))
 *  source: (string))
 * ```
 */
export const getAssociatedImportPath = (capture: QueryCapture, logger: Logger): string | null => {
  let parentNode = capture.node.parent;
  while (parentNode) {
    const importStatements = parentNode.descendantsOfType('import_statement');
    if (importStatements.length > 0) {
      if (importStatements.length > 1) {
        // this should never happen, otherwise this isn't a valid import statement
        logger.debug(`Found multiple import statements in ${parentNode.text}`);
        return null;
      }
      const sourceNode = importStatements[0].childForFieldName('source');
      if (sourceNode) {
        return sourceNode.text;
      }
    }
    parentNode = parentNode.parent;
  }
  return null;
};
