<script setup lang="ts">
import { computed } from 'vue';
import { Copy } from 'lucide-vue-next';
import hljs from 'highlight.js/lib/common';

interface Props {
  code: string;
  language?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  copyCode: [code: string];
}>();

const highlighted = computed(() => {
  const lang = props.language && hljs.getLanguage(props.language) ? props.language : 'plaintext';
  return hljs.highlight(props.code, { language: lang }).value;
});

const copy = () => {
  emit('copyCode', props.code);
};
</script>

<template>
  <div class="relative group">
    <button
      type="button"
      class="absolute right-2 top-2 z-10 inline-flex items-center justify-center size-7 rounded border border-border bg-background text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground cursor-pointer"
      aria-label="Copy to clipboard"
      @click="copy"
    >
      <Copy class="size-3.5" />
    </button>
    <pre
      class="hljs-block font-mono text-sm whitespace-pre break-all rounded-lg bg-background p-2.5 max-h-96 overflow-y-auto m-0"
    ><code class="hljs" :class="language ? `language-${language}` : ''" v-html="highlighted" /></pre>
  </div>
</template>
