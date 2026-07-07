import { QueryCapture, SyntaxNode } from 'web-tree-sitter';

/**
 * Basic traversal to find the import path for a dynamic import statement
 *
 * A tree may look like this:
 * ```
 * (lexical_declaration
 *  (variable_declarator
 *    name: (object_pattern
 *      (pair_pattern
 *        key: (property_identifier)
 *        value: (identifier)))
 *    value: (await_expression
 *      (call_expression
 *        function: (import)
 *        arguments: (arguments
 *          (string
 *            (string_fragment)))))))
 * ```
 */
export const getDynamicImportPath = (capture: QueryCapture): string | null => {
  let currentNode: SyntaxNode | null = capture.node;

  while (currentNode && currentNode.type !== 'variable_declarator') {
    currentNode = currentNode.parent;
  }

  if (!currentNode) return null;

  // Get the value node which could be either call_expression or await_expression
  const valueNode = currentNode.childForFieldName('value');
  if (!valueNode) return null;

  if (valueNode.type === 'call_expression') {
    // In this case, the import path is the first argument of the call_expression
    const args = valueNode.childForFieldName('arguments');
    if (!args) return null;

    const stringArg = args.descendantsOfType('string')[0];
    return stringArg ? stringArg.text : null;
  }
  if (valueNode.type === 'await_expression') {
    // Same as above, but we need to find the nested call_expression
    const importCallExpr = valueNode
      .descendantsOfType('call_expression')
      .find((node) => node.firstChild?.type === 'import');

    if (!importCallExpr) return null;

    const args = importCallExpr.childForFieldName('arguments');
    if (!args) return null;

    const stringArg = args.descendantsOfType('string')[0];
    return stringArg ? stringArg.text : null;
  }

  return null;
};
