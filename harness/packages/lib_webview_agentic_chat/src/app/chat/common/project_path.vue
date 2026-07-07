<script>
import { GlIcon } from '@gitlab/ui';
import { mapState } from 'pinia';
import { useMainStore } from '../stores/main';

export default {
  props: {
    centered: {
      type: Boolean,
      default: false,
    },
  },
  components: {
    GlIcon,
  },
  computed: {
    ...mapState(useMainStore, ['projectPath']),
    cssClass() {
      return this.centered ? 'gl-justify-center' : '';
    },
  },
};
</script>
<template>
  <div v-if="projectPath" :class="cssClass" class="gl-flex gl-items-center gl-text-secondary">
    <gl-icon name="project" :size="14" />
    <small class="gl-pl-2">Project: {{ projectPath }}</small>
  </div>
</template>
