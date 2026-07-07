import { vueRouter } from 'storybook-vue3-router';
import { RouteRecordRaw } from 'vue-router';

//  To allow <router-view> and <router-link> in stories.
//  Without vueRouter, storybook will throw warning for unresolved components.
const vueRouterDecorator = (routes: RouteRecordRaw[]) => {
  return vueRouter(routes);
};

export default vueRouterDecorator;
