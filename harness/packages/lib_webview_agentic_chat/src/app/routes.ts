import VueRouter from 'vue-router';
import { CHAT_ROUTES } from './chat/router';

export const createRouter = (base = '/webview/agentic-duo-chat/') => {
  const routes = [...CHAT_ROUTES];

  return new VueRouter({
    base,
    mode: 'hash',
    routes,
  });
};
