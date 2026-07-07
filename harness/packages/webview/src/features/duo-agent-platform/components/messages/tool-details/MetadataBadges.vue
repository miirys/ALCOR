<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';
import {
  Folder,
  Users,
  Tag,
  CircleDot,
  GitMerge,
  SquareCheck,
  Layers,
  GitBranch,
  Circle,
} from 'lucide-vue-next';

interface Badge {
  key: string;
  label: string;
  value: string;
  icon: Component;
}

interface Props {
  args: Record<string, unknown>;
}

const props = defineProps<Props>();

const METADATA_FIELDS: { key: string; label: string; icon: Component }[] = [
  { key: 'project_name', label: 'Project', icon: Folder },
  { key: 'project_path', label: 'Project', icon: Folder },
  { key: 'project_full_path', label: 'Project', icon: Folder },
  { key: 'project_id', label: 'Project', icon: Folder },
  { key: 'group_path', label: 'Group', icon: Users },
  { key: 'group_id', label: 'Group', icon: Users },
  { key: 'type_name', label: 'Type', icon: Tag },
  { key: 'issue_iid', label: 'Issue', icon: CircleDot },
  { key: 'merge_request_iid', label: 'Merge request', icon: GitMerge },
  { key: 'work_item_iid', label: 'Work item', icon: SquareCheck },
  { key: 'epic_iid', label: 'Epic', icon: Layers },
  { key: 'source_branch', label: 'Source branch', icon: GitBranch },
  { key: 'target_branch', label: 'Target branch', icon: GitBranch },
  { key: 'branch', label: 'Branch', icon: GitBranch },
  { key: 'state', label: 'State', icon: Circle },
];

const PROJECT_KEYS = ['project_name', 'project_path', 'project_full_path', 'project_id'];

function buildBadges(a: Record<string, unknown>): Badge[] {
  const preferredProject = PROJECT_KEYS.find((k) => a[k]);
  const seenKeys = new Set<string>();
  const badges: Badge[] = [];

  for (const { key, label, icon } of METADATA_FIELDS) {
    const isProjectField = PROJECT_KEYS.includes(key);
    const shouldSkip = !a[key] || (isProjectField && key !== preferredProject) || seenKeys.has(key);

    if (!shouldSkip) {
      seenKeys.add(key);
      badges.push({ key, label, value: String(a[key]), icon });
    }
  }
  return badges;
}

const badges = computed(() => buildBadges(props.args));
</script>

<template>
  <div v-if="badges.length > 0" class="flex flex-wrap gap-2">
    <span
      v-for="badge in badges"
      :key="badge.key"
      class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-sm font-medium text-muted-foreground"
    >
      <component :is="badge.icon" class="size-4 shrink-0" />
      {{ badge.label }}: {{ badge.value }}
    </span>
  </div>
</template>
