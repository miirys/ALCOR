import Vue from 'vue';
import { resolveMessageBus } from '@gitlab-org/webview-client';
import { THEMING_PREVIEW_WEBVIEW_ID } from '../../metadata';
import App from './App.vue';
import './styles.scss';

Vue.config.productionTip = false;

// Initialize the message bus to receive theme updates
resolveMessageBus({
  webviewId: THEMING_PREVIEW_WEBVIEW_ID,
});

const el: HTMLElement | null = document.getElementById('app');

if (el) {
  new Vue({
    el,
    render(createElement) {
      return createElement(App);
    },
  }).$mount();
}
