import Vue from 'vue';
import VueRouter from 'vue-router';

import { WEBVIEW_ID as AGENTIC_TABS_WEBVIEW_ID } from '../../contract.ts';

Vue.use(VueRouter);

export const CHAT_ROUTE = 'chat';
export const FLOW_ROUTE = 'flow';

const routes = [
  {
    path: '/',
    redirect: { name: CHAT_ROUTE },
  },
  {
    path: `/${CHAT_ROUTE}`,
    name: CHAT_ROUTE,
  },
  {
    path: `/${FLOW_ROUTE}`,
    name: FLOW_ROUTE,
  },
];

export const router = new VueRouter({
  mode: 'hash',
  base: `/webview/${AGENTIC_TABS_WEBVIEW_ID}/`,
  routes,
});
