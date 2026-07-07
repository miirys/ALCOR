import type { RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '',
    component: () => import('./Layout.vue'),
    children: [
      {
        path: '',
        name: 'flow-builder',
        component: () => import('./pages/FlowBuilder.vue'),
      },
    ],
  },
];
