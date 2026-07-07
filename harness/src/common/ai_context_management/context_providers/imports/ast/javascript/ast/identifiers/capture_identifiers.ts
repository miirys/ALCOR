import { QueryCapture } from 'web-tree-sitter';

/**
 * We use this method to get the original identifier and
 * alias for a given capture. The traversal varies
 * depending on the capture type.
 */
export const getCaptureIdentifier = (
  capture: QueryCapture,
): {
  originalIdentifier: string;
  alias: string | null;
} | null => {
  const parentNode = capture.node.parent;
  if (!parentNode) {
    return {
      originalIdentifier: capture.node.text,
      alias: null,
    };
  }

  switch (capture.name) {
    case 'imported-identifier': {
      // For named imports, return the original name
      return {
        originalIdentifier: capture.node.text,
        alias: null,
      };
    }
    case 'renamed-identifier': {
      // For aliased imports, find the original identifier
      const originalIdentifier = parentNode.childForFieldName('name');
      return {
        originalIdentifier: originalIdentifier ? originalIdentifier.text : capture.node.text,
        alias: capture.node.text,
      };
    }
    case 'default-import':
    case 'namespace-import':
    case 'require-name':
    case 'dynamic-import-name': {
      // Check if this is part of a pair_pattern (aliased destructuring)
      if (parentNode.type === 'pair_pattern') {
        const key = parentNode.childForFieldName('key');
        return {
          originalIdentifier: key ? key.text : capture.node.text,
          alias: capture.node.text,
        };
      }
      // For regular patterns, just return the identifier directly
      return {
        originalIdentifier: capture.node.text,
        alias: null,
      };
    }
    default:
      return {
        originalIdentifier: capture.node.text,
        alias: null,
      };
  }
};
