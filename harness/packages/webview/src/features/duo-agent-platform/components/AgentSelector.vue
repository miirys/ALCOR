<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { ChevronDown, Check, Search, AlertCircleIcon } from 'lucide-vue-next';
import { useAgentsStore } from '../stores/agentsStore';
import { useChatStore } from '../stores/chatStore';
import TanukiVerifiedSvg from '../svgs/TanukiVerified.vue';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Button from '@/components/ui/button/Button.vue';
import Input from '@/components/ui/input/Input.vue';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{ select: [agentId: string] }>();

const agentsStore = useAgentsStore();
const chatStore = useChatStore();
const { isFlowMode } = storeToRefs(chatStore);

const { agents, selectedAgent, error } = storeToRefs(agentsStore);

const open = ref(false);
const search = ref('');

// Tracking open tooltip id to avoid dangling tooltip when scrolling
const openTooltipId = ref<string | null>(null);
const onListScroll = () => {
  openTooltipId.value = null;
};

const filteredAgents = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return agents.value;
  return agents.value.filter(
    (a) => a.name.toLowerCase().includes(query) || a.description?.toLowerCase().includes(query),
  );
});

watch(open, (isOpen) => {
  if (!isOpen) search.value = '';
});

const handleSelect = (agentId: string) => {
  emit('select', agentId);
  open.value = false;
};
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        :disabled="isFlowMode || props.disabled"
        class="gap-1 text-xs h-7 px-0 min-w-0"
      >
        <span class="truncate">{{ isFlowMode ? '/flow' : selectedAgent.name }}</span>
        <ChevronDown v-if="!isFlowMode" class="size-3 opacity-60 shrink-0" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" side="top" :side-offset="0">
      <div class="relative mb-2">
        <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input v-model="search" placeholder="Search agents..." class="pl-7 h-8 text-xs" autofocus />
      </div>
      <div class="max-h-60 overflow-y-auto" @scroll="onListScroll">
        <TooltipProvider>
          <Button
            v-for="agent in filteredAgents"
            :key="agent.id"
            variant="ghost"
            class="flex w-full items-start gap-2 rounded-sm py-2 text-xs cursor-pointer hover:bg-dropdown h-auto focus-visible:bg-dropdown focus-visible:ring-0"
            @click="handleSelect(agent.id)"
          >
            <div class="flex-1 text-left whitespace-normal">
              <div class="flex items-center gap-1">
                <span class="font-semibold">{{ agent.name }}</span>
                <Tooltip
                  v-if="agent.foundational"
                  :open="openTooltipId === agent.id"
                  @update:open="(v: boolean) => (openTooltipId = v ? agent.id : null)"
                >
                  <TooltipTrigger as-child>
                    <span tabindex="-1" class="inline-flex">
                      <TanukiVerifiedSvg class="size-3.5 text-muted-foreground" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Created and maintained by GitLab</TooltipContent>
                </Tooltip>
              </div>
              <p v-if="agent.description" class="text-muted-foreground mt-0.5">
                {{ agent.description }}
              </p>
            </div>
            <Check class="size-3.5 shrink-0 mt-0.5" v-if="agent.id === selectedAgent.id" />
          </Button>
          <p v-if="!filteredAgents.length" class="py-2 text-center text-xs text-muted-foreground">
            No agents found
          </p>
        </TooltipProvider>
      </div>
      <Alert variant="destructive" v-if="error">
        <AlertCircleIcon />
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>
    </PopoverContent>
  </Popover>
</template>
