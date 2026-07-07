<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  class?: string;
}

const props = withDefaults(defineProps<SpinnerProps>(), {
  size: 'md',
});

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
  xl: 'h-12 w-12 border-4',
};

const spinnerClass = computed(() =>
  cn(
    'inline-block animate-spin rounded-full border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]',
    sizeClasses[props.size],
    props.class,
  ),
);
</script>

<template>
  <div :class="spinnerClass" role="status" aria-label="Loading">
    <span class="sr-only">Loading...</span>
  </div>
</template>
