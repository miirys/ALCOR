import Vue from 'vue';
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
