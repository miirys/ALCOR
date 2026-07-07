<script setup lang="ts">
import { computed } from 'vue';
import { CircleCheck, CircleX } from 'lucide-vue-next';
import type { EnablementCheckType } from '@gitlab-lsp/workflow-api';
import { useChatStore } from '../../stores/chatStore';

const props = defineProps<{ item: EnablementCheckType }>();

const chatStore = useChatStore();

const display = computed<{ label: string; link?: string }>(() => {
  switch (props.item.name) {
    case 'feature_flag':
      return {
        label: 'Turn on the feature flag duo_workflow for this project.',
        link: 'https://docs.gitlab.com/administration/feature_flags/',
      };
    case 'duo_features_enabled':
      return {
        label: 'Turn on GitLab Duo for this project.',
        link: 'https://docs.gitlab.com/user/gitlab_duo/turn_on_off/',
      };
    case 'feature_available':
      return {
        label: 'Turn on experimental features.',
        link: 'https://docs.gitlab.com/user/gitlab_duo/turn_on_off/#turn-on-beta-and-experimental-features',
      };
    default:
      return { label: props.item.message };
  }
});
</script>

<template>
  <li class="flex items-start gap-2 list-none">
    <CircleCheck v-if="item.value" class="size-4 shrink-0 mt-0.5 text-green-600" />
    <CircleX v-else class="size-4 shrink-0 mt-0.5 text-destructive" />
    <button
      v-if="display.link"
      type="button"
      class="text-left text-link-foreground hover:underline"
      @click="chatStore.openUrl(display.link)"
    >
      {{ display.label }}
    </button>
    <span v-else>{{ display.label }}</span>
  </li>
</template>
