<script setup lang="ts">
import { computed } from 'vue';
import { prettyResponse } from '../../../utils/prettyResponse';
import CodeBlock from './CodeBlock.vue';

interface Props {
  toolName: string;
  args: Record<string, unknown>;
  toolResponse: unknown;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  copyCode: [code: string];
}>();

const requestJson = computed(() => JSON.stringify(props.args, null, 2));
const responseContent = computed<string | null>(() => prettyResponse(props.toolResponse));
</script>

<template>
  <div class="flex flex-col gap-2">
    <figure class="m-0 rounded-lg bg-muted">
      <figcaption
        class="flex min-w-0 items-center gap-2 py-2 font-mono font-semibold text-muted-foreground"
      >
        <span class="shrink-0">Request</span>
        <span class="font-normal break-all">({{ toolName }})</span>
      </figcaption>
      <CodeBlock :code="requestJson" language="json" @copy-code="emit('copyCode', $event)" />
    </figure>
    <figure v-if="responseContent !== null" class="m-0 rounded-lg bg-muted">
      <figcaption
        class="flex items-center gap-2 py-2 font-mono font-semibold text-muted-foreground"
      >
        Response
      </figcaption>
      <CodeBlock :code="responseContent" @copy-code="emit('copyCode', $event)" />
    </figure>
  </div>
</template>
