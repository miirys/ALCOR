import { VueRenderer } from '@storybook/vue3-vite';
import { createPinia, setActivePinia } from 'pinia';

import { DecoratorFunction } from 'storybook/internal/csf';

const piniaDecorator: DecoratorFunction<VueRenderer> = (story) => {
  setActivePinia(createPinia());
  return story();
};

export default piniaDecorator;
