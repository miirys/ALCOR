<script>
export default {
  name: 'Tab',
  props: {
    id: {
      type: String,
      required: true,
    },
    src: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      default: 'tab',
    },
  },
  methods: {
    onLoad() {
      console.log('Loaded iframe content successfully');
    },

    onError(error) {
      console.error('Failed to load iframe:', error);
    },
  },
};
</script>

<template>
  <div class="w-100 gl-flex-grow gl-flex gl-flex-column">
    <iframe
      :id="`iframe-${id}`"
      :src="src"
      :title="title"
      class="w-100 border-0"
      @load="onLoad"
      @error="onError"
    />
  </div>
</template>
