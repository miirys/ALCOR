/**
 * Extracts the first non-empty line from a GraphQL query. We expect this to be the operation type and name.
 */
function extractGraphQLQueryIdentifier(query: string): string {
  return (query.split('\n').find((s) => s.trim()) ?? query.replace('\n', '')).trim();
}

/**
 * Extracts the operation type (query/mutation/subscription) from a GraphQL query.
 * Returns undefined if no valid operation type is found.
 */
function extractGraphQLOperationType(query: string): string | undefined {
  const firstLine = extractGraphQLQueryIdentifier(query);
  const match = firstLine.match(/^(query|mutation|subscription)\s+/);
  return match?.[1];
}

/**
 * Extracts the operation name from a GraphQL query.
 * Returns undefined if no operation name is found.
 */
function extractGraphQLOperationName(query: string): string | undefined {
  const firstLine = extractGraphQLQueryIdentifier(query);
  const match = firstLine.match(/(?:query|mutation|subscription)\s+(\w+)/);
  return match?.[1];
}

/**
 * Extracts a formatted operation label (e.g., "query: getUser") from a GraphQL query.
 * Returns undefined if the query doesn't have a valid operation.
 */
export function extractGraphQLOperationLabel(query: string): string | undefined {
  const operationType = extractGraphQLOperationType(query);
  const operationName = extractGraphQLOperationName(query);

  if (operationType) {
    return `${operationType}: ${operationName ?? 'anonymous'}`;
  }

  return undefined;
}
