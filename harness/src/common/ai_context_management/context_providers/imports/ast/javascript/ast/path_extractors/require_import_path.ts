import { QueryCapture, SyntaxNode } from 'web-tree-sitter';

/**
 * Basic traversal to find the import path for a require statement
 *
 * An example tree may look like this:
 * ```
 * A tree may look like this:
 *   (lexical_declaration
 *    (variable_declarator
 *      name: (object_pattern
 *        (pair_pattern
 *          key: (property_identifier)
 *          value: (identifier)))
 *      value: (call_expression
 *        function: (identifier)
 *        arguments: (arguments
 *          (string
 *            (string_fragment))))))
 * ```
 */
export const getRequireImportPath = (capture: QueryCapture): string | null => {
  let currentNode: SyntaxNode | null = capture.node;

  while (currentNode && currentNode.type !== 'variable_declarator') {
    currentNode = currentNode.parent;
  }

  if (!currentNode) return null;

  // We need to find the call_expression in the value field
  const callExpression = currentNode.childForFieldName('value');
  if (!callExpression || callExpression.type !== 'call_expression') return null;

  // We want the first argument of the call_expression
  const args = callExpression.childForFieldName('arguments');
  if (!args) return null;

  const stringArg = args.descendantsOfType('string')[0];
  return stringArg ? stringArg.text : null;
};
