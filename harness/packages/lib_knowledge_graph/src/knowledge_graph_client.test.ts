import { Logger } from '@gitlab-org/logging';
import fetch from 'cross-fetch';
import { createFakePartial } from '@gitlab-org/test-utils';
import { LocalKnowledgeGraphClient } from './knowledge_graph_client';

jest.mock('cross-fetch');

describe('LocalKnowledgeGraphClient', () => {
  let client: LocalKnowledgeGraphClient;
  let logger: Logger;
  let mockFetch: jest.MockedFunction<typeof fetch>;
  const port = 8080;
  const baseUrl = new URL(`http://localhost:${port}`);

  beforeEach(() => {
    logger = createFakePartial<Logger>({
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    });

    mockFetch = fetch as jest.MockedFunction<typeof fetch>;

    client = new LocalKnowledgeGraphClient(logger, baseUrl);
  });

  describe('index', () => {
    const workspaceUri = 'file:///path/to/workspace';
    const workspaceFolderPath = '/path/to/workspace';

    it('should make request to the correct endpoint with proper headers and body', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await client.index(workspaceUri);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/workspace/index',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ workspace_folder_path: workspaceFolderPath }),
        }),
      );
    });

    it('should log success message when request is successful', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await client.index(workspaceUri);

      expect(logger.info).toHaveBeenCalledWith(
        `Successfully indexed workspace ${workspaceFolderPath}.`,
      );
    });

    it('should handle HTTP error when response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await client.index(workspaceUri);

      expect(logger.error).toHaveBeenCalledWith(
        `Error indexing workspace ${workspaceFolderPath}: 404 Not Found.`,
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      const unexpectedError = new Error('Unexpected error');
      mockFetch.mockRejectedValue(unexpectedError);

      await expect(client.index(workspaceUri)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        `Error indexing workspace ${workspaceFolderPath}:`,
        unexpectedError,
      );
    });

    it('should skip indexing and log for non-file:// URIs', async () => {
      const virtualUri = 'adt://my-sap-server/sap/bc/adt/packages/zmy_package';

      await client.index(virtualUri);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Skipping indexing for virtual workspace'),
      );
    });
  });

  describe('updateContextExclusion', () => {
    const projectPath = 'gitlab-org/gitlab';
    const exclusionRules = ['*.log', 'node_modules/**', 'dist/**'];

    it('should make request to the correct endpoint with proper headers and body', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await client.updateContextExclusion(projectPath, exclusionRules);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/project/context-exclusion',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_path: projectPath,
            patterns: exclusionRules,
          }),
        }),
      );
    });

    it('should log success message when request is successful', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await client.updateContextExclusion(projectPath, exclusionRules);

      expect(logger.info).toHaveBeenCalledWith(
        `Successfully updated context exclusion for project ${projectPath}.`,
      );
    });

    it('should handle empty exclusion rules', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await client.updateContextExclusion(projectPath, []);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/project/context-exclusion',
        expect.objectContaining({
          body: JSON.stringify({
            project_path: projectPath,
            patterns: [],
          }),
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Updating context exclusion rules for project ${projectPath} with 0 rules`,
      );
    });

    it('should log info message when response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await client.updateContextExclusion(projectPath, exclusionRules);

      expect(logger.info).toHaveBeenCalledWith(
        `Context exclusion update unavailable for project ${projectPath}: 400 Bad Request.`,
      );
    });

    it('should log info message when unexpected errors occur', async () => {
      const unexpectedError = new Error('Network error');
      mockFetch.mockRejectedValue(unexpectedError);

      await expect(
        client.updateContextExclusion(projectPath, exclusionRules),
      ).resolves.toBeUndefined();

      expect(logger.info).toHaveBeenCalledWith(
        `Context exclusion update unavailable for project ${projectPath}:`,
        unexpectedError,
      );
    });
  });
});
