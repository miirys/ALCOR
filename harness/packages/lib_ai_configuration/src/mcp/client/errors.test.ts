import { McpError } from './errors';

describe('McpError', () => {
  describe('toolExecutionFailed', () => {
    it('includes the cause message when an Error is provided', () => {
      const error = McpError.toolExecutionFailed(
        'semantic-server',
        'semantic_code_search',
        new Error('Semantic index not ready'),
      );

      expect(error.message).toContain(
        'Failed to execute tool semantic_code_search on server semantic-server',
      );
      expect(error.message).toContain('Cause: Semantic index not ready');
    });

    it('stringifies non-error causes so they are visible', () => {
      const error = McpError.toolExecutionFailed('semantic-server', 'semantic_code_search', {
        detail: 'Indexing in progress',
        retryAt: '2025-11-12T12:00:00Z',
      });

      expect(error.message).toContain('"detail":"Indexing in progress"');
      expect(error.message).toContain('"retryAt":"2025-11-12T12:00:00Z"');
    });

    it('renders text-only payloads when cause is an array of text fragments', () => {
      const error = McpError.toolExecutionFailed('semantic-server', 'semantic_code_search', [
        { type: 'text', text: 'Tool execution failed: Unable to perform semantic search' },
        {
          type: 'text',
          text: "Project 'gitlab-duo/test' has no embeddings - initial indexing is ongoing",
        },
      ]);

      expect(error.message).toContain(
        "Cause: Tool execution failed: Unable to perform semantic search Project 'gitlab-duo/test' has no embeddings - initial indexing is ongoing",
      );
    });
  });
});
