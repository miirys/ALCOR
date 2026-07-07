import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { RouterView } from 'vue-router';
import App from './App.vue';

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders RouterView', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: true,
        },
      },
    });

    // App should contain a RouterView component
    expect(wrapper.findComponent(RouterView).exists()).toBe(true);

    // App should have the correct root element
    expect(wrapper.find('#app').exists()).toBe(true);
  });
});
