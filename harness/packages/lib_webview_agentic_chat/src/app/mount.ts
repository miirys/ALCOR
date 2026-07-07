import { createPinia, PiniaVuePlugin } from 'pinia';
import Vue from 'vue';
import VueRouter from 'vue-router';
import { GlToast } from '@gitlab/ui';
import { resolveMessageBus } from '@gitlab-org/webview-client';
import { WebviewId } from '@gitlab-org/webview-plugin';
import { createBridge } from '../common/bridge';
import App from './chat/app.vue';
import { createRouter } from './routes';
import { CHATS_NEW } from './chat/routes/constants';
import { setWorkflowStoreEvents } from './stores/plugins/workflow_store_events_plugin';
import { MODE_PARAM } from './chat/constants';
import { useMainStore } from './chat/stores/main';

export const mountAgenticChat = (webviewId: WebviewId) => {
  const messageBus = resolveMessageBus({
    webviewId,
  });
  const bridge = createBridge(messageBus);

  Vue.config.productionTip = false;
  Vue.use(GlToast);
  Vue.use(PiniaVuePlugin);
  Vue.use(VueRouter);

  const pinia = createPinia();
  pinia.use(setWorkflowStoreEvents(bridge));

  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get(MODE_PARAM);

  const router = createRouter();

  const el: HTMLElement | null = document.getElementById('app');

  interface Actions {
    setMode(mode: string): void;
  }

  if (el) {
    new Vue({
      pinia,
      router,
      created() {
        const mainStore = useMainStore() as ReturnType<typeof useMainStore> & Actions;
        if (mode) {
          // This needs to happen before all of the other hooks in created inside
          // packages/lib_webview_agentic_chat/src/app/chat/app.vue to avoid loading the
          // wrong data.
          mainStore.setMode(mode);
        }

        return router.push({ name: CHATS_NEW });
      },
      render(createElement) {
        return createElement(App);
      },
    }).$mount(el);
  }
};
