import Vue from 'vue';
// FIXME: This never compiled, but now that I started compiling the package with TS, I need to ignore the vue import
// @ts-ignore
import App from './App.vue';

Vue.config.productionTip = false;

const el: HTMLElement | null = document.getElementById('app');

if (el) {
  new Vue({
    el,
    render(createElement) {
      return createElement(App);
    },
  }).$mount();
}
