/**
 * MCP Dashboard Routes
 * Self-contained routing configuration for the MCP feature
 *
 * Uses Layout Wrapper Component Pattern:
 * - McpLayout handles initialization/cleanup via Vue lifecycle hooks
 * - Nested routes render within the layout's <router-view>
 * - More maintainable than navigation guards for lifecycle management
 */

import type { RouteRecordRaw } from 'vue-router';

/**
 * MCP feature routes with nested layout pattern
 * The layout component handles store initialization/disposal automatically
 */
export const mcpRoutes: RouteRecordRaw[] = [
  {
    path: '/mcp',
    component: () => import('./McpLayout.vue'),
    children: [
      {
        path: '',
        name: 'mcp-dashboard',
        component: () => import('./McpDashboard.vue'),
      },
      {
        path: 'servers/:serverName',
        name: 'mcp-server-detail',
        component: () => import('./components/ServerDetail.vue'),
      },
      {
        path: 'tools/:toolName',
        name: 'mcp-tool-detail',
        component: () => import('./components/ToolDetail.vue'),
      },
    ],
  },
];
