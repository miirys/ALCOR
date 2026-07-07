/**
 * MCP Service Factory
 * Provides dependency injection for MCP services
 */

import type { IMcpService } from './IMcpService';
import { MockMcpService } from './mockMcpService';
import { MessageBusMcpService } from './messageBusMcpService';

/**
 * Service configuration
 */
interface McpServiceConfig {
  type: 'mock' | 'messagebus';
  // WebSocket-specific config
  websocketUrl?: string;
  // HTTP-specific config
  httpBaseUrl?: string;
}

let serviceInstance: IMcpService | null = null;

/**
 * Create an MCP service instance based on configuration
 */
function createMcpService(config: McpServiceConfig): IMcpService {
  switch (config.type) {
    case 'mock':
      return new MockMcpService();

    case 'messagebus':
      return new MessageBusMcpService();

    default:
      throw new Error(`Unknown service type: ${config.type}`);
  }
}

/**
 * Get or create the singleton service instance
 */
export function getMcpService(): IMcpService {
  if (!serviceInstance) {
    if (import.meta.env.DEV) {
      serviceInstance = createMcpService({ type: 'mock' });
    } else {
      serviceInstance = createMcpService({ type: 'messagebus' });
    }
  }
  return serviceInstance;
}

/**
 * Reset the service instance
 */
export async function resetMcpService(): Promise<void> {
  if (serviceInstance) {
    await serviceInstance.dispose();
    serviceInstance = null;
  }
}
