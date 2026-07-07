<script setup lang="ts">
import type { NavigationMenuRootEmits, NavigationMenuRootProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { NavigationMenuRoot, useForwardPropsEmits } from 'reka-ui';
import NavigationMenuViewport from './NavigationMenuViewport.vue';
import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<
    NavigationMenuRootProps & {
      class?: HTMLAttributes['class'];
      viewport?: boolean;
    }
  >(),
  {
    viewport: true,
  },
);
const emits = defineEmits<NavigationMenuRootEmits>();

const delegatedProps = reactiveOmit(props, 'class', 'viewport');
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <NavigationMenuRoot
    v-slot="slotProps"
    data-slot="navigation-menu"
    :data-viewport="viewport"
    v-bind="forwarded"
    :class="
      cn('group/navigation-menu relative flex flex-1 items-center justify-center', props.class)
    "
  >
    <slot v-bind="slotProps" />
    <NavigationMenuViewport v-if="viewport" />
  </NavigationMenuRoot>
</template>
