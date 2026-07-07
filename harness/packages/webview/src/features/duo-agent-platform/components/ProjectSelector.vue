<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { CircleAlert, Folder } from 'lucide-vue-next';
import { SelectGroup, SelectLabel } from 'reka-ui';
import { useRepositoriesStore } from '../stores/repositoriesStore';
import { useChat } from '../composables/useChat';
import { useChatStore } from '../stores/chatStore';
import Tooltip from '@/components/ui/tooltip/Tooltip.vue';
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue';
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue';
import TooltipProvider from '@/components/ui/tooltip/TooltipProvider.vue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const repositoriesStore = useRepositoriesStore();
const { allProjects, repositories, selectedProjectPath, isLoading } =
  storeToRefs(repositoriesStore);
const { currentProject } = useChat();
const { workflowProjectPath } = storeToRefs(useChatStore());
const { selectProject } = repositoriesStore;

const isOpen = ref(false);

// Get display text for the selected project
const displayText = computed(() => {
  if (!currentProject.value) {
    return 'Select project';
  }
  const { name, remoteName } = currentProject.value;
  return remoteName ? `${name} (${remoteName})` : name;
});

// Get display text for locked project
const lockedProjectDisplayText = computed(() => {
  if (!workflowProjectPath.value) {
    return '';
  }

  const project = allProjects.value.find((p) => p.namespaceWithPath === workflowProjectPath.value);

  if (project) {
    const { name, remoteName } = project;
    return remoteName ? `${name} (${remoteName})` : name;
  }

  // Project not in current workspace, just show the path
  return workflowProjectPath.value;
});

// Check if selector is disabled (locked to a workflow project)
const isSelectorDisabled = computed(() => {
  return workflowProjectPath.value !== null;
});

// Get available projects (only those with DAP access)
const availableProjects = computed(() => {
  return allProjects.value.filter((p) => p.duoAgenticChatAvailable === true);
});

const handleSelect = (projectPath: unknown) => {
  if (typeof projectPath === 'string') selectProject(projectPath);
};
</script>

<template>
  <!-- TODO: integrate with workflow. When exiting workflow is selected, locked project should be dispalyed -->
  <!-- Locked project display -->
  <div
    v-if="isSelectorDisabled && lockedProjectDisplayText"
    data-testid="locked-project"
    class="flex items-center gap-2 px-2 py-1 w-full"
  >
    <span class="text-sm truncate" :title="lockedProjectDisplayText">
      {{ lockedProjectDisplayText }}
    </span>
  </div>

  <!-- Project selector dropdown -->
  <Select
    v-else
    :open="isOpen"
    @update:open="isOpen = $event"
    :model-value="selectedProjectPath ?? undefined"
    @update:model-value="handleSelect"
  >
    <SelectTrigger data-testid="project-selector-trigger" :disabled="isLoading" class="w-full">
      <SelectValue :placeholder="isLoading ? 'Loading projects...' : 'Select project'">
        <span v-if="!isLoading" class="truncate block">{{ displayText }}</span>
      </SelectValue>
    </SelectTrigger>

    <SelectContent data-testid="project-selector-content" class="w-full min-w-full" align="end">
      <div v-if="availableProjects.length === 0" class="px-2 py-1.5 text-sm text-muted-foreground">
        No projects available
      </div>

      <div v-else>
        <!-- Group projects by repository -->
        <div v-for="repo in repositories" :key="repo.rootFsPath">
          <!-- Repository header -->
          <SelectGroup class="px-2 py-1.5 text-xs font-semibold">
            <SelectLabel class="flex p-2">
              <Folder class="w-4 h-4 mr-1" />
              {{ repo.folderName }}
            </SelectLabel>
            <!-- Projects in this repository -->
            <SelectItem
              v-for="project in repo.projects"
              :key="project.namespaceWithPath"
              :value="project.namespaceWithPath"
              :disabled="!project.duoAgenticChatAvailable"
              class="data-highlighted:bg-button"
            >
              <div class="flex items-center gap-2 min-w-0">
                <div class="flex flex-col gap-1 min-w-0">
                  <span
                    class="truncate"
                    :class="{ 'text-muted-foreground': !project.duoAgenticChatAvailable }"
                  >
                    {{ project.name }}
                  </span>
                  <span v-if="project.remoteName" class="text-xs text-muted-foreground truncate">
                    {{ project.remoteName }}
                  </span>
                </div>
                <div
                  v-if="!project.duoAgenticChatAvailable"
                  class="flex-shrink-0 pointer-events-auto"
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <CircleAlert class="w-4 h-4 text-orange-600" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>This project does not have Duo Agent Platform access</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </SelectItem>
          </SelectGroup>
        </div>
      </div>
    </SelectContent>
  </Select>
</template>
