<script setup lang="ts">
import type { DuoMessage } from '@gitlab-org/graphql';

interface Props {
  message: DuoMessage;
}

defineProps<Props>();
</script>
<template>
  <div class="w-full min-w-0 py-3 px-5">
    <div class="whitespace-pre-wrap wrap-break-word flex-1">
      {{ message.content }}
    </div>
  </div>
</template>
