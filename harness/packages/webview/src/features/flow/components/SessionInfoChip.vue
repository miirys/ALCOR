<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Folder, User, ShieldAlert } from 'lucide-vue-next';
import { useFlow } from '../composables/useFlow';
import type { SessionProjectRole } from '../types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const flow = useFlow();

const session = computed(() => flow.sessionInfo.value);
const user = computed(() => session.value?.user ?? null);
const project = computed(() => session.value?.project ?? null);

const ROLE_LABEL: Record<SessionProjectRole, string> = {
  owner: 'Owner',
  maintainer: 'Maintainer',
  developer: 'Developer',
  reader: 'Read-only',
  unknown: 'Unknown role',
};

const roleLabel = computed(() => (project.value ? ROLE_LABEL[project.value.role] : null));
const isLowAccess = computed(() => {
  const role = project.value?.role;
  return role === 'reader' || role === 'unknown';
});

const initials = computed(() => {
  const source = user.value?.name || user.value?.username || '';
  if (!source) return '';
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
});

const tooltip = computed(() => {
  const lines: string[] = [];
  if (user.value) {
    lines.push(`${user.value.name} (@${user.value.username})`);
  } else {
    lines.push('No GitLab user resolved');
  }
  if (project.value) {
    lines.push(`Project: ${project.value.path}`);
    if (project.value.id) lines.push(`ID: ${project.value.id}`);
    if (project.value.namespacePath) lines.push(`Namespace: ${project.value.namespacePath}`);
    if (roleLabel.value) lines.push(`Role: ${roleLabel.value}`);
    if (project.value.canCreateCatalogItem === true) {
      lines.push('AI Catalog: can create');
    } else if (project.value.canCreateCatalogItem === false) {
      lines.push('AI Catalog: cannot create');
    }
  } else {
    lines.push('No project resolved');
  }
  return lines.join('\n');
});

const avatarFailed = ref(false);
watch(
  () => user.value?.avatarUrl,
  () => {
    avatarFailed.value = false;
  },
);

const showAvatar = computed(() => Boolean(user.value?.avatarUrl) && !avatarFailed.value);
</script>

<template>
  <div v-if="user || project">
    <Tooltip>
      <TooltipTrigger as-child>
        <div
          class="flex items-center gap-2 px-2.5 py-1 bg-card/95 backdrop-blur-sm border border-border rounded-full shadow-sm text-xs select-none max-w-[360px]"
          :aria-label="tooltip"
        >
          <!-- Avatar -->
          <div
            v-if="user"
            class="h-5 w-5 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-medium text-muted-foreground"
          >
            <img
              v-if="showAvatar"
              :src="user.avatarUrl"
              :alt="user.username"
              class="h-full w-full object-cover"
              @error="avatarFailed = true"
            />
            <span v-else>{{ initials || '?' }}</span>
          </div>
          <User v-else class="h-3.5 w-3.5 text-muted-foreground" />

          <!-- Username -->
          <span v-if="user" class="font-medium text-foreground truncate">
            @{{ user.username }}
          </span>
          <span v-else class="italic text-muted-foreground">no user</span>

          <!-- Project -->
          <template v-if="project">
            <span class="text-border">·</span>
            <Folder class="h-3 w-3 text-muted-foreground shrink-0" />
            <span class="text-muted-foreground truncate">{{ project.path }}</span>
          </template>

          <!-- Role -->
          <span
            v-if="roleLabel"
            class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0"
            :class="
              isLowAccess
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-600'
                : 'border-border bg-muted text-muted-foreground'
            "
          >
            <ShieldAlert v-if="isLowAccess" class="inline-block h-2.5 w-2.5 mr-0.5 -mt-0.5" />{{
              roleLabel
            }}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div class="whitespace-pre-line text-xs leading-snug">{{ tooltip }}</div>
      </TooltipContent>
    </Tooltip>
  </div>
</template>
