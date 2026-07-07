import type { RouteRecordRaw } from 'vue-router';

export const duoAgentPlatformRoutes: RouteRecordRaw[] = [
  {
    path: '',
    component: () => import('./Layout.vue'),
    children: [
      {
        path: '',
        name: 'chat',
        component: () => import('./pages/DuoChat.vue'),
      },
      {
        path: 'chat/:workflowId',
        name: 'chat-with-id',
        component: () => import('./pages/DuoChat.vue'),
      },
      {
        path: 'history',
        name: 'duo-history',
        component: () => import('./pages/History.vue'),
      },
    ],
  },
];
