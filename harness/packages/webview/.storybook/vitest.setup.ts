import { setProjectAnnotations } from '@storybook/vue3-vite';
import * as projectAnnotations from './preview';
import * as a11yAddonAnnotations from '@storybook/addon-a11y/preview';
import { beforeAll } from 'vitest';

const annotations = setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);

beforeAll(annotations.beforeAll);
