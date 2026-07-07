<script setup lang="ts">
import { computed, ref } from 'vue';
import { Terminal, ChevronRight } from 'lucide-vue-next';
import CodeBlock from './CodeBlock.vue';
import Collapsible from '@/components/ui/collapsible/Collapsible.vue';
import CollapsibleContent from '@/components/ui/collapsible/CollapsibleContent.vue';
import CollapsibleTrigger from '@/components/ui/collapsible/CollapsibleTrigger.vue';

interface Props {
  toolName: string;
  args: Record<string, unknown>;
  toolResponse: unknown;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  copyCode: [code: string];
}>();

const commandStr = computed(() => {
  if (props.toolName === 'run_git_command') {
    const cmd = String(props.args.command ?? '');
    const cmdArgs = props.args.args ? ` ${props.args.args}` : '';
    return `git ${cmd}${cmdArgs}`;
  }
  const cmd = String(props.args.command ?? props.args.program ?? '');
  const cmdArgs = props.args.args ? ` ${props.args.args}` : '';
  return `${cmd}${cmdArgs}`;
});

const commandOutput = computed<string | null>(() => {
  const r = props.toolResponse;
  if (!r) return null;
  if (typeof r === 'string') return r;
  if (typeof r === 'object' && r !== null && 'content' in r) {
    return String((r as Record<string, unknown>).content ?? '');
  }
  return null;
});

const outputOpen = ref(false);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <Terminal class="size-4 shrink-0 text-muted-foreground border border-border rounded-sm" />
      <code class="font-mono wrap-break-word break-all whitespace-pre-wrap">{{ commandStr }}</code>
    </div>
    <Collapsible v-if="commandOutput !== null" v-model:open="outputOpen">
      <CollapsibleTrigger
        class="inline-flex items-center gap-1.5 px-2 py-1 text-link text-primary hover:text-button-hover hover:underline cursor-pointer -ml-2"
      >
        <ChevronRight
          class="size-4 shrink-0 transition-transform duration-150"
          :class="{ 'rotate-90': outputOpen }"
        />
        Expand command output
      </CollapsibleTrigger>
      <CollapsibleContent class="mt-2">
        <CodeBlock :code="commandOutput" language="bash" @copy-code="emit('copyCode', $event)" />
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
