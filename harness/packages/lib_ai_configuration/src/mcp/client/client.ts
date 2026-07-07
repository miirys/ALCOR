import { Logger } from '@gitlab-org/logging';
import { ResultAsync, errAsync } from 'neverthrow';
import {
  CallToolResult,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpTool, McpToolName, ServerName } from '../types';
import { AsyncCache } from './utils/async_cache';
import { McpError } from './errors';

/**
 * High-level client interface for interacting with an MCP server.
 * Only exists when the connection is in Connected state.
 * Automatically becomes invalid if the connection is lost.
 */
export class McpClient {
  readonly #sdkClient: Client;

  readonly #serverName: ServerName;

  readonly #logger: Logger;

  readonly #toolCache: AsyncCache<McpTool[], McpError>;

  #disposed = false;

  #notificationCleanup?: () => void;

  constructor(sdkClient: Client, serverName: ServerName, logger: Logger) {
    this.#sdkClient = sdkClient;
    this.#serverName = serverName;
    this.#logger = logger;

    // Initialize tool cache
    this.#toolCache = new AsyncCache<McpTool[], McpError>({
      fetcher: (signal) => this.#fetchTools(signal),
    });

    // Subscribe to tool list changes
    this.#setupNotifications();
  }

  // ----- Tool Management ---------------------------------------------------

  /**
   * Get available tools from the server (cached).
   * Cache is automatically invalidated when server sends list_changed notification.
   */
  getTools(): ResultAsync<McpTool[], McpError> {
    this.#ensureNotDisposed();
    return this.#toolCache.get();
  }

  /**
   * Force refresh tools from the server, bypassing cache.
   */
  async refreshTools(): Promise<ResultAsync<McpTool[], McpError>> {
    this.#ensureNotDisposed();
    this.#logger.debug('Forcing tool refresh');
    return this.#toolCache.refresh();
  }

  /**
   * Execute a tool on the server.
   */
  executeTool(toolName: string, args: Record<string, unknown>): ResultAsync<string, McpError> {
    this.#ensureNotDisposed();
    this.#logger.debug(`Executing tool="${toolName}" args=${JSON.stringify(args)}`);

    return ResultAsync.fromPromise(
      this.#sdkClient.callTool({ name: toolName, arguments: args }) as Promise<CallToolResult>,
      (error) => McpError.toolExecutionFailed(this.#serverName, toolName, error),
    )
      .orTee((e) => this.#logger.debug(`Tool call failed - error="${e.message}"`))
      .andThen((result) => {
        if (result.isError) {
          this.#logger.error(`Tool execution error tool="${toolName}"`, result);
          return errAsync(McpError.toolExecutionFailed(this.#serverName, toolName, result.content));
        }

        // TODO: Add support for non-text responses
        const textContent = result.content
          .filter((item) => item.type === 'text')
          .map((item) => ('text' in item ? item.text : ''))
          .join('\n');

        return ResultAsync.fromSafePromise(Promise.resolve(textContent));
      })
      .andTee(() => this.#logger.debug(`Tool execution succeeded tool="${toolName}"`));
  }

  // ----- Lifecycle ---------------------------------------------------------

  /**
   * Dispose and cleanup resources.
   * After disposal, all methods will throw.
   */
  dispose(): void {
    if (this.#disposed) return;

    this.#disposed = true;

    // Unsubscribe from notifications
    this.#notificationCleanup?.();
    this.#notificationCleanup = undefined;

    // Dispose cache
    this.#toolCache.dispose();
  }

  // ----- Internal ----------------------------------------------------------

  #setupNotifications(): void {
    try {
      this.#sdkClient.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
        if (this.#disposed) return;
        this.#logger.debug('Received notifications/tools/list_changed notification');
        await this.#toolCache.refresh();
      });

      this.#notificationCleanup = () => {
        this.#sdkClient.removeNotificationHandler('notifications/tools/list_changed');
      };
    } catch (error) {
      // Log but don't fail - notifications are nice-to-have
      this.#logger.warn('Failed to setup tool change notifications', error);
    }
  }

  #fetchTools(signal: AbortSignal): ResultAsync<McpTool[], McpError> {
    this.#logger.debug('Fetching tools from server');

    return ResultAsync.fromPromise(this.#sdkClient.listTools({}, { signal }), (error) =>
      McpError.listToolsFailed(this.#serverName, error),
    ).map((result) => {
      const mapped = result.tools.map(
        (tool) =>
          ({
            name: McpToolName.create({
              serverName: this.#serverName,
              toolName: tool.name,
            }),
            originalToolName: tool.name,
            serverName: this.#serverName,
            description: tool.description || '',
            inputSchema: JSON.stringify(tool.inputSchema),
            isApproved: false,
          }) as McpTool,
      );

      this.#logger.debug(`Fetched tools count=${mapped.length}`);
      return mapped;
    });
  }

  #ensureNotDisposed(): void {
    if (this.#disposed) {
      throw new Error('McpClient has been disposed');
    }
  }
}
