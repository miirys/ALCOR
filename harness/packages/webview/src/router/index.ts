import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { mcpRoutes } from '@/features/mcp-dashboard/router';
import { duoAgentPlatformRoutes } from '@/features/duo-agent-platform/router';
import { routes as flowRoutes } from '../features/flow';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/features/home').then((m) => m.HomeFeature),
  },
  {
    path: '/flow',
    children: flowRoutes,
  },
  // MCP feature routes (self-contained with layout wrapper)
  ...mcpRoutes,
  {
    path: '/duoAgentPlatform',
    children: duoAgentPlatformRoutes,
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    // Restore position on browser back/forward
    if (savedPosition) {
      return savedPosition;
    }
    // Always scroll to top on new navigation
    return { top: 0 };
  },
});

export default router;
