<script setup lang="ts">
defineProps<{
  value: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:value': [value: boolean];
}>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="value"
    :disabled="disabled"
    class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    :class="value ? 'bg-primary' : 'bg-muted'"
    @click="emit('update:value', !value)"
  >
    <span
      class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform"
      :class="value ? 'translate-x-5' : 'translate-x-0'"
    />
  </button>
</template>
