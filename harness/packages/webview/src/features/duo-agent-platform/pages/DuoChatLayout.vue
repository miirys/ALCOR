<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { useForwardPropsEmits } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<{ class?: HTMLAttributes['class'] }>();
const delegatedProps = reactiveOmit(props, 'class');
const forwarded = useForwardPropsEmits(delegatedProps);
</script>

<template>
  <div v-bind="forwarded" :class="cn('flex min-h-0 h-full flex-col overflow-hidden', props.class)">
    <!-- Sticky header: stays at the top of the container -->
    <div class="sticky top-0 z-10">
      <slot name="header"></slot>
    </div>

    <!-- The scrollable chat area.
      - Grows to fill between header & footer
      - Shows its own scrollbar when content exceeds space
      - Never overlaps header or footer

      The responsibility of implementing the scrolling behavior
      and any additional features (like auto-scroll) belongs
      to the consumer of this component.

      The `Conversation` component handles this automatically, when put
      into the slot.
      For other component, ensure those implement the follwing HTML structure:

      ```html
      <template #conversation>
        <div class="min-h-0 flex-1 overflow-y-auto scroll-smooth [scrollbar-gutter:stable]"
        >
          <div class="grid min-h-full content-end">
            // YOUR CONVERSATION CONTENT GOES HERE
          </div>
        </div>
      </template>
      ```
    -->
    <slot name="conversation">Conversation</slot>

    <!-- Sticky footer: stays at the bottom of the container -->
    <div class="footer-container sticky bottom-0 z-10">
      <slot name="footer">Footer</slot>
    </div>
  </div>
</template>
