import Vue from 'vue';
import VueRouter from 'vue-router';
import { resolveMessageBus } from '@gitlab-org/webview-client';
import { WEBVIEW_ID } from '../contract';
import App from './app.vue';
import { router } from './router';

resolveMessageBus({
  webviewId: WEBVIEW_ID,
});

Vue.config.productionTip = false;
Vue.use(VueRouter);

const el: HTMLElement | null = document.getElementById('app');

if (el) {
  new Vue({
    el,
    router,
    render(createElement) {
      return createElement(App);
    },
  }).$mount();
}
