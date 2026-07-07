<script setup lang="ts">
import { computed, inject } from 'vue';
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { deriveVarName } from './extensions';
import { PROMPT_EDITOR_SESSION_KEY, type PromptEditorSession } from './usePromptEditorSession';

const props = defineProps(nodeViewProps);

const session = inject<PromptEditorSession>(PROMPT_EDITOR_SESSION_KEY);

const attrs = computed(() => props.node.attrs);

/**
 * Detect whether the user chose a custom varName that differs from the
 * auto-derived field name. When true, the pill shows varName prominently
 * so the user can tell what template token is being used.
 */
const isCustomVarName = computed(() => {
  const { varName, path } = attrs.value;
  if (!varName || !path || path === varName) return false;
  return varName !== deriveVarName(path);
});

/** Primary pill text: "varName → Display Label" for custom tokens, display label otherwise. */
const label = computed(() => {
  if (isCustomVarName.value && attrs.value.displayLabel) {
    return `${attrs.value.varName} \u2192 ${attrs.value.displayLabel}`;
  }
  return attrs.value.displayLabel || attrs.value.varName || attrs.value.path;
});

const useFallback = computed(() => !attrs.value.displayLabel);

const siblingCount = computed(() => {
  const { varName } = attrs.value;
  if (!varName || !session) return 0;
  return session.siblingCounts.value.get(varName) ?? 0;
});

const dotColor = computed(() => {
  switch (attrs.value.sourceNodeType) {
    case 'agent':
      return 'bg-purple-400';
    case 'tool':
      return 'bg-blue-400';
    case 'ai-task':
      return 'bg-emerald-400';
    case 'workflow':
      return 'bg-amber-400';
    case 'runtime':
      return 'bg-teal-300';
    default:
      return 'bg-muted-foreground/50';
  }
});

const statusClasses = computed(() => {
  switch (attrs.value.status) {
    case 'valid':
      return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
    case 'runtime':
      return 'bg-teal-500/10 text-teal-300 border-teal-500/20';
    case 'broken':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'type-mismatch':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'unknown':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/25 border-dashed';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
});

const isBroken = computed(() => attrs.value.status === 'broken');

const tooltip = computed(() => {
  const name = attrs.value.varName || attrs.value.path;
  switch (attrs.value.status) {
    case 'runtime':
      return `{{${name}}} — injected at runtime`;
    case 'unknown':
      return `{{${name}}} — click to wire to an upstream output`;
    case 'broken':
      return `{{${name}}} — source no longer available`;
    case 'valid':
      if (isCustomVarName.value) {
        return `{{${name}}} → ${attrs.value.displayLabel}`;
      }
      return `{{${name}}} → ${attrs.value.path}`;
    default:
      return `{{${name}}}`;
  }
});

function handleDelete(event: MouseEvent) {
  event.stopPropagation();
  props.deleteNode();
}
</script>

<template>
  <NodeViewWrapper as="span" class="inline">
    <span
      contenteditable="false"
      role="button"
      tabindex="-1"
      :title="tooltip"
      :class="[
        'group inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[12px] leading-tight align-baseline cursor-pointer transition-shadow',
        statusClasses,
        selected && 'ring-2 ring-ring/50',
      ]"
    >
      <span :class="['inline-block size-1.5 shrink-0 rounded-full', dotColor]" />
      <span :class="[isBroken && 'line-through', useFallback && 'font-mono']">{{ label }}</span>
      <sup
        v-if="siblingCount > 1"
        class="text-[8px] opacity-60 -ml-0.5"
        :title="`${siblingCount} instances \u2014 changes apply to all`"
        >{{ siblingCount }}</sup
      >
      <span
        class="hidden group-hover:inline-flex items-center justify-center size-3.5 -mr-0.5 rounded-full text-[9px] leading-none hover:bg-foreground/10"
        @click="handleDelete"
        >&times;</span
      >
    </span>
  </NodeViewWrapper>
</template>
