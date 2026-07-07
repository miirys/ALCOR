<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { onClickOutside } from '@vueuse/core';
import {
  MoreVertical,
  Eye,
  RotateCw,
  ShieldAlert,
  Trash2,
  Edit,
  Check,
  X,
  Undo2,
} from 'lucide-vue-next';
import type { McpServerState, ServerName } from '../types/mcp';
import {
  ConnectionState,
  isStdioConfig,
  isSseConfig,
  isHttpConfig,
  isServerConfig,
} from '../types/mcp';
import {
  getConnectionIcon,
  getConnectionIconClass,
  getConnectionLabel,
} from '../utils/connectionUtils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props {
  server: McpServerState;
  toolCount: number;
  approvedToolCount: number;
  workspaceUri?: string | null;
}

const props = defineProps<Props>();
const router = useRouter();
const showMenu = ref(false);
const menuRef = ref<HTMLElement | null>(null);
const menuPosition = ref({ top: 0, left: 0 });

const emit = defineEmits<{
  restart: [serverName: ServerName];
  startAuth: [serverName: ServerName];
  edit: [serverName: ServerName];
  delete: [serverName: ServerName];
  approve: [serverName: ServerName];
  reject: [serverName: ServerName];
  revokeDecision: [serverName: ServerName];
}>();

function navigateToDetails() {
  router.push(`/mcp/servers/${props.server.name}`);
}

function toggleMenu(event: Event) {
  showMenu.value = !showMenu.value;

  if (showMenu.value && event.target instanceof HTMLElement) {
    // Calculate position relative to the button
    const buttonRect = event.target.closest('button')?.getBoundingClientRect();
    if (buttonRect) {
      menuPosition.value = {
        top: buttonRect.bottom + 4, // 4px gap below button
        left: buttonRect.right - 176, // 176px is menu width (w-44 = 11rem = 176px)
      };
    }
  }
}

// Close menu when clicking outside
onClickOutside(menuRef, () => {
  showMenu.value = false;
});

function handleRestart() {
  emit('restart', props.server.name);
  showMenu.value = false;
}

function handleStartAuth() {
  if (props.server.authUrl) {
    window.open(props.server.authUrl, '_blank');
  }
  emit('startAuth', props.server.name);
  showMenu.value = false;
}

const connectionIcon = computed(() => {
  return getConnectionIcon(props.server.connectionState);
});

const connectionIconClass = computed(() => {
  return getConnectionIconClass(props.server.connectionState);
});
function handleEdit() {
  emit('edit', props.server.name);
  showMenu.value = false;
}

function handleDelete() {
  emit('delete', props.server.name);
  showMenu.value = false;
}

function handleApprove(event: Event) {
  event.stopPropagation();
  emit('approve', props.server.name);
}

function handleReject(event: Event) {
  event.stopPropagation();
  emit('reject', props.server.name);
}

function handleRevokeDecision() {
  emit('revokeDecision', props.server.name);
  showMenu.value = false;
}

const connectionLabel = computed(() => {
  return getConnectionLabel(props.server.connectionState);
});

const connectionUptime = computed(() => {
  if (!props.server.connectedAt || props.server.connectionState !== ConnectionState.Connected) {
    return null;
  }
  const now = Date.now();
  const connected = props.server.connectedAt.getTime();
  const diff = Math.floor((now - connected) / 1000);

  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
});

const isWorkspaceConfig = computed(() => {
  if (!props.server.configSource || !props.workspaceUri) {
    return false;
  }

  // Normalize paths by removing file:// protocol and trailing slashes
  const normalizedWorkspace = props.workspaceUri.replace(/^file:\/\//, '').replace(/\/+$/, '');
  const normalizedConfigSource = props.server.configSource.replace(/^file:\/\//, '');

  // Check if config source is within the workspace directory
  return normalizedConfigSource.startsWith(`${normalizedWorkspace}/`);
});
</script>

<template>
  <Card
    class="group hover:shadow-lg transition-all duration-200 cursor-pointer relative p-0 rounded-lg"
    :class="{
      'border-l-[6px] border-l-destructive hover:border-l-destructive':
        server.connectionState === ConnectionState.Failed,
      'border-l-[6px] border-l-amber-500 hover:border-l-amber-500':
        server.connectionState === ConnectionState.Disconnected,
      'border-l-[6px] border-l-orange-500 hover:border-l-orange-500':
        server.connectionState === ConnectionState.Authenticating,
      'border-l-[6px] border-l-green-500 hover:border-l-green-500':
        server.connectionState === ConnectionState.Connected,
      'border-l-[6px] border-l-blue-500 hover:border-l-blue-500':
        server.connectionState === ConnectionState.Connecting,
      'opacity-75': server.connectionState === ConnectionState.Connecting,
      'border-l-[6px] border-l-yellow-500 hover:border-l-yellow-500':
        server.connectionState === ConnectionState.PendingApproval,
      'border-l-[6px] border-l-destructive hover:border-l-destructive border-l-dashed':
        server.connectionState === ConnectionState.Rejected,
    }"
    @click="navigateToDetails"
  >
    <!-- Header with Name/Title -->
    <div class="px-3 py-2.5 flex items-start justify-between gap-3">
      <div class="flex items-start gap-2 flex-1 min-w-0">
        <!-- Status indicator with icon -->
        <div
          class="relative p-1.5 rounded-md bg-muted/50 group-hover:bg-muted transition-colors shrink-0 flex items-center justify-center cursor-help"
          :class="{
            'ring-1 ring-green-500/20': server.connectionState === ConnectionState.Connected,
            'ring-1 ring-amber-500/20': server.connectionState === ConnectionState.Disconnected,
            'ring-1 ring-orange-500/20': server.connectionState === ConnectionState.Authenticating,
            'ring-1 ring-destructive/20': server.connectionState === ConnectionState.Failed,
            'ring-1 ring-blue-500/20': server.connectionState === ConnectionState.Connecting,
          }"
          :title="
            server.connectionState === ConnectionState.Failed && server.error
              ? `Failed: ${server.error}`
              : connectionLabel
          "
          @click.stop
        >
          <!-- Connection status icon using utility function -->
          <component
            :is="connectionIcon"
            class="h-3.5 w-3.5"
            :class="connectionIconClass"
            :aria-label="
              server.connectionState === ConnectionState.Failed && server.error
                ? `Failed: ${server.error}`
                : server.connectionState === ConnectionState.Connected && connectionUptime
                  ? `Connected for ${connectionUptime}`
                  : connectionLabel
            "
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h3 class="text-base font-semibold truncate leading-tight">{{ server.name }}</h3>
            <span
              v-if="server.connectionState === ConnectionState.Authenticating"
              class="shrink-0 px-1.5 py-0.5 text-xs font-medium bg-orange-500/10 text-orange-600 border border-orange-500/20 rounded"
            >
              Auth Required
            </span>
            <span
              v-if="server.connectionState === ConnectionState.PendingApproval"
              class="shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-yellow-500/10 text-yellow-700 border border-yellow-500/20 rounded"
            >
              Pending Approval
            </span>
            <span
              v-if="server.connectionState === ConnectionState.Rejected"
              class="shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-destructive/10 text-destructive border border-destructive/20 rounded"
            >
              Rejected
            </span>
          </div>
          <p
            v-if="server.serverInfo?.title || server.serverInfo?.version"
            class="text-base text-muted-foreground truncate mt-0.5 leading-tight"
          >
            <span v-if="server.serverInfo?.title">{{ server.serverInfo.title }}</span>
            <span v-if="server.serverInfo?.title && server.serverInfo?.version" class="mx-1"
              >·</span
            >
            <span v-if="server.serverInfo?.version" class="text-muted-foreground"
              >v{{ server.serverInfo.version }}</span
            >
          </p>
        </div>
      </div>
      <div class="relative shrink-0">
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6 -mr-1 opacity-60 hover:opacity-100"
          @click.stop="toggleMenu"
        >
          <MoreVertical class="h-3.5 w-3.5" />
        </Button>
        <!-- Dropdown Menu (Teleported to body) -->
        <Teleport to="body">
          <div
            v-if="showMenu"
            ref="menuRef"
            class="fixed z-50 w-44 bg-popover border rounded-lg shadow-xl animate-in fade-in-0 zoom-in-95 duration-200"
            :style="{
              top: menuPosition.top + 'px',
              left: menuPosition.left + 'px',
            }"
            @click.stop
          >
            <div class="p-1">
              <button
                @click="navigateToDetails"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-accent rounded-md transition-colors"
              >
                <Eye class="h-3.5 w-3.5" />
                View Details
              </button>
              <button
                @click="handleEdit"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-accent rounded-md transition-colors"
              >
                <Edit class="h-3.5 w-3.5" />
                Edit Server
              </button>
              <button
                @click="handleRestart"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-accent rounded-md transition-colors"
              >
                <RotateCw class="h-3.5 w-3.5" />
                Restart
              </button>
              <button
                v-if="server.connectionState === ConnectionState.Authenticating"
                @click="handleStartAuth"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-accent rounded-md transition-colors text-orange-600"
              >
                <ShieldAlert class="h-3.5 w-3.5" />
                Start Auth
              </button>
              <button
                v-if="server.connectionState === ConnectionState.Rejected"
                @click="handleRevokeDecision"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-accent rounded-md transition-colors"
              >
                <Undo2 class="h-3.5 w-3.5" />
                Revoke Rejection
              </button>
              <div class="h-px bg-border my-1" />
              <button
                @click="handleDelete"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-destructive/10 text-destructive rounded-md transition-colors"
              >
                <Trash2 class="h-3.5 w-3.5" />
                Delete Server
              </button>
            </div>
          </div>
        </Teleport>
      </div>
    </div>

    <!-- Details -->
    <div v-if="isServerConfig(server.config)" class="px-3 pb-2.5 space-y-1">
      <!-- Configuration Error (if present) -->
      <div
        v-if="server.error === 'Invalid configuration' && server.error"
        class="text-base bg-destructive/10 text-destructive px-2 py-1.5 rounded border border-destructive/20"
      >
        <span class="font-semibold">Config Error:</span>
        <span class="ml-1">{{ server.error }}</span>
      </div>

      <!-- Transport Type -->
      <div class="text-base text-muted-foreground">
        <span class="text-muted-foreground">transport:</span>
        <span class="ml-1 font-medium">{{ server.config.type }}</span>
      </div>

      <!-- Command/URL with optional uptime -->
      <div class="text-base text-muted-foreground truncate">
        <span v-if="isStdioConfig(server.config)">
          <span class="text-muted-foreground">command:</span>
          <code class="ml-1 bg-muted/50 px-1.5 py-0.5 rounded text-sm">{{
            server.config.command
          }}</code>
          <span v-if="connectionUptime" class="ml-3 text-muted-foreground">uptime:</span>
          <span v-if="connectionUptime" class="ml-1 font-medium tabular-nums">{{
            connectionUptime
          }}</span>
        </span>
        <span v-else-if="isSseConfig(server.config) || isHttpConfig(server.config)">
          <span class="text-muted-foreground">url:</span>
          <code class="ml-1 bg-muted/50 px-1.5 py-0.5 rounded text-sm">{{
            server.config.url
          }}</code>
        </span>
      </div>

      <!-- Tool Count -->
      <div class="text-base text-muted-foreground">
        <span class="text-muted-foreground">tools:</span>
        <span
          v-if="server.connectionState === ConnectionState.Connected"
          class="ml-1 font-medium tabular-nums"
          >{{ toolCount }}</span
        >
        <span
          v-else-if="server.connectionState === ConnectionState.Connecting"
          class="ml-1 text-muted-foreground"
          >...</span
        >
        <span v-else class="ml-1 text-muted-foreground">—</span>
        <span class="ml-3 text-muted-foreground">approved tools:</span>
        <span
          v-if="server.connectionState === ConnectionState.Connected"
          class="ml-1 font-medium tabular-nums"
          >{{ approvedToolCount }}</span
        >
        <span
          v-else-if="server.connectionState === ConnectionState.Connecting"
          class="ml-1 text-muted-foreground"
          >...</span
        >
        <span v-else class="ml-1 text-muted-foreground">—</span>
      </div>

      <!-- Config Source with Badge -->
      <div
        v-if="server.configSource"
        class="text-base text-muted-foreground flex items-center gap-2"
      >
        <div class="truncate">
          <span class="text-muted-foreground">config:</span>
          <code class="ml-1 bg-muted/50 px-1.5 py-0.5 rounded text-sm">{{
            server.configSource
          }}</code>
        </div>
        <span
          v-if="isWorkspaceConfig"
          class="shrink-0 px-1.5 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20 rounded"
        >
          workspace
        </span>
        <span
          v-else
          class="shrink-0 px-1.5 py-0.5 text-xs font-medium bg-purple-500/10 text-purple-600 border border-purple-500/20 rounded"
        >
          user
        </span>
      </div>
      <!-- Approval action buttons -->
      <div
        v-if="server.connectionState === ConnectionState.PendingApproval"
        class="px-3 pb-2.5 flex gap-2"
        @click.stop
      >
        <button
          class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-500/10 text-green-700 border border-green-500/20 rounded hover:bg-green-500/20 transition-colors"
          @click="handleApprove"
        >
          <Check class="h-3.5 w-3.5" />
          Approve
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20 rounded hover:bg-destructive/20 transition-colors"
          @click="handleReject"
        >
          <X class="h-3.5 w-3.5" />
          Reject
        </button>
      </div>
    </div>
  </Card>
</template>
