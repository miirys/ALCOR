<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import CodeBlock from './CodeBlock.vue';
import MetadataBadges from './MetadataBadges.vue';
import Collapsible from '@/components/ui/collapsible/Collapsible.vue';
import CollapsibleContent from '@/components/ui/collapsible/CollapsibleContent.vue';
import CollapsibleTrigger from '@/components/ui/collapsible/CollapsibleTrigger.vue';

interface Props {
  toolName: string;
  args: Record<string, unknown>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  copyCode: [code: string];
}>();

const titleValue = computed(() => (props.args.title ? String(props.args.title) : null));

const descriptionValue = computed<string | null>(() => {
  const v = props.args.description ?? props.args.body ?? props.args.comment ?? null;
  return v != null ? String(v) : null;
});

const requestJson = computed(() => JSON.stringify(props.args, null, 2));

const descriptionOpen = ref(false);
const jsonOpen = ref(false);
</script>

<template>
  <div class="flex flex-col gap-2">
    <MetadataBadges :args="args" />
    <p v-if="titleValue" class="m-0">
      Set the title "<em>{{ titleValue }}</em
      >".
    </p>
    <Collapsible v-if="descriptionValue" v-model:open="descriptionOpen">
      <CollapsibleTrigger
        class="inline-flex items-center gap-1 px-2 py-1 text-link text-primary hover:text-button-hover hover:underline cursor-pointer -ml-2"
      >
        <ChevronRight
          class="size-4 transition-transform duration-150"
          :class="{ 'rotate-90': descriptionOpen }"
        />
        Read description
      </CollapsibleTrigger>
      <CollapsibleContent class="mt-2">
        <CodeBlock
          :code="descriptionValue"
          language="markdown"
          @copy-code="emit('copyCode', $event)"
        />
      </CollapsibleContent>
    </Collapsible>
    <Collapsible v-model:open="jsonOpen">
      <CollapsibleTrigger
        class="inline-flex items-center gap-1 px-2 py-1 text-link text-primary hover:text-button-hover hover:underline cursor-pointer -ml-2 text-left"
      >
        <ChevronRight
          class="size-4 transition-transform duration-150"
          :class="{ 'rotate-90': jsonOpen }"
        />
        See request parameters as JSON
      </CollapsibleTrigger>
      <CollapsibleContent class="mt-2">
        <CodeBlock :code="requestJson" language="json" @copy-code="emit('copyCode', $event)" />
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
