<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  AlertCircle,
  Wrench,
  RotateCw,
  Pencil,
  CheckCheck,
  ShieldCheck,
  ShieldX,
  ShieldQuestion,
} from 'lucide-vue-next';
import { useMcpStore } from '../stores/mcpStore';
import { ConnectionState, isStdioConfig, isServerConfig } from '../types/mcp';
import type { ServerName, ServerConfig } from '../types/mcp';
import { getConnectionIcon, getConnectionIconClass } from '../utils/connectionUtils';
import { useDestructiveSaveWarning } from '../composables/useDestructiveSaveWarning';
import ToolCard from './ToolCard.vue';
import DestructiveSaveWarningDialog from './DestructiveSaveWarningDialog.vue';
import LogViewer from './LogViewer.vue';
import AddServerModal from './AddServerModal.vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

const route = useRoute();
const router = useRouter();
const mcpStore = useMcpStore();

// Edit modal state
const showEditModal = ref(false);
const isEditingServerName = ref(false);

const serverName = computed(() => route.params.serverName as ServerName);
const server = computed(() => mcpStore.getServerByName(serverName.value));
const tools = computed(() => mcpStore.getToolsForServer(serverName.value));

/**
 * Whether this server originates from the workspace config.
 * A server defined in both workspace and user configs resolves to the workspace
 * path (workspace takes precedence), so this correctly returns true in that case.
 * The Server Approval section is only relevant for workspace servers — user-profile
 * servers are auto-approved and cannot be revoked from here.
 */
const isWorkspaceServer = computed(() => {
  return server.value?.scope === 'workspace';
});

const connectionIcon = computed(() => {
  return getConnectionIcon(server.value?.connectionState);
});

const connectionIconClass = computed(() => {
  return getConnectionIconClass(server.value?.connectionState);
});

const connectionUptime = computed(() => {
  if (!server.value?.connectedAt || server.value.connectionState !== ConnectionState.Connected) {
    return null;
  }
  const now = Date.now();
  const connected = server.value.connectedAt.getTime();
  const diff = Math.floor((now - connected) / 1000);

  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
});

function goBack() {
  router.push('/mcp');
}

function handleRestart() {
  if (server.value) {
    mcpStore.restartServer(server.value.name);
  }
}

function handleEdit() {
  if (server.value) {
    // Open the edit modal on this page
    showEditModal.value = true;
  }
}

async function handleSaveServer(
  ...args: [ServerName, ServerConfig, 'workspace' | 'user', ServerName?]
) {
  const [newServerName, config, targetFile, originalName] = args;

  try {
    // If editing and name changed, delete the old one first
    if (originalName && originalName !== newServerName) {
      isEditingServerName.value = true;
      await mcpStore.deleteServer(originalName);
    }

    await mcpStore.saveServer(newServerName, config, targetFile);

    // Close modal on success
    showEditModal.value = false;

    // If server name changed, navigate to the new server detail page
    if (originalName && originalName !== newServerName) {
      router.push(`/mcp/servers/${newServerName}`);
    }
  } catch {
    // Error is already handled by the store
  } finally {
    // Always reset the loading state
    isEditingServerName.value = false;
  }
}

function handleClearLogs() {
  if (server.value) {
    mcpStore.clearLogsForServer(server.value.name);
  }
}

async function handleApprove() {
  if (server.value) {
    await mcpStore.approveServer(server.value.name);
  }
}

async function handleReject() {
  if (server.value) {
    await mcpStore.rejectServer(server.value.name);
  }
}

async function handleRevokeDecision() {
  if (server.value) {
    await mcpStore.revokeServerDecision(server.value.name);
  }
}

// ===== Tool Approval =====

// The pending approved tool list — set before triggerWithCheck so onConfirm closes over it
const pendingApprovedToolNames = ref<string[] | null>(null);
const pendingApproveAll = ref(false);

const approvalConfigPath = computed(() => server.value?.configSource ?? null);

async function performSaveApprovedTools(approvedToolNames: string[]): Promise<void> {
  try {
    if (pendingApproveAll.value) {
      await mcpStore.approveAllTools(serverName.value);
    } else {
      await mcpStore.saveApprovedTools(serverName.value, approvedToolNames);
    }
  } finally {
    pendingApproveAll.value = false;
    pendingApprovedToolNames.value = null;
  }
}

const {
  showWarning: showApprovalDestructiveWarning,
  dialogTitle: approvalDialogTitle,
  dialogDescription: approvalDialogDescription,
  dialogButtonText: approvalDialogButtonText,
  triggerWithCheck: triggerApprovalCheck,
  confirm: confirmApprovalSave,
  cancel: cancelApprovalSave,
} = useDestructiveSaveWarning({
  configPath: approvalConfigPath,
  operationType: computed(() => 'approveTools' as const),
  onConfirm: async () => {
    if (pendingApprovedToolNames.value !== null) {
      await performSaveApprovedTools(pendingApprovedToolNames.value);
    }
  },
});

async function handleToolToggle(toolName: string, approved: boolean): Promise<void> {
  const currentApproved = tools.value
    .filter((t) => (t.originalToolName === toolName ? approved : t.isApproved))
    .map((t) => t.originalToolName);

  pendingApprovedToolNames.value = currentApproved;
  await triggerApprovalCheck();
}

async function handleApproveAll(): Promise<void> {
  pendingApproveAll.value = true;
  pendingApprovedToolNames.value = tools.value.map((t) => t.originalToolName);
  await triggerApprovalCheck();
}

onMounted(async () => {
  // Scroll to top when component mounts
  const scrollContainer = document.querySelector('.server-detail > .overflow-auto');
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }

  if (mcpStore.servers.length === 0) {
    await mcpStore.loadData();
  }
});
</script>

<template>
  <div class="server-detail h-full flex flex-col p-6 space-y-4">
    <!-- Header with Breadcrumb -->
    <header class="space-y-3">
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" @click="goBack" class="h-8 w-8 shrink-0">
          <ArrowLeft class="h-4 w-4" />
        </Button>
        <div class="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
          <button @click="goBack" class="hover:text-foreground transition-colors">
            MCP Servers
          </button>
          <span>/</span>
          <span class="text-foreground font-medium truncate">{{ serverName }}</span>
        </div>
      </div>

      <div v-if="server" class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div
            class="p-2 rounded-md bg-muted/50 shrink-0"
            :class="{
              'ring-1 ring-green-500/20': server.connectionState === ConnectionState.Connected,
              'ring-1 ring-amber-500/20': server.connectionState === ConnectionState.Disconnected,
              'ring-1 ring-destructive/20': server.connectionState === ConnectionState.Failed,
              'ring-1 ring-blue-500/20': server.connectionState === ConnectionState.Connecting,
            }"
          >
            <component :is="connectionIcon" class="h-5 w-5" :class="connectionIconClass" />
          </div>
          <div class="min-w-0 flex-1">
            <h1 class="text-xl font-bold truncate">{{ server.name }}</h1>
            <p class="text-xs text-muted-foreground">
              <span v-if="server.serverInfo?.title">{{ server.serverInfo.title }}</span>
              <span v-if="server.serverInfo?.title && server.serverInfo?.version" class="mx-1"
                >·</span
              >
              <span v-if="server.serverInfo?.version">v{{ server.serverInfo.version }}</span>
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button @click="handleEdit" variant="outline" size="sm">
            <Pencil class="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button
            @click="handleRestart"
            :disabled="
              server.connectionState === ConnectionState.Connecting ||
              server.connectionState === ConnectionState.Rejected ||
              server.connectionState === ConnectionState.PendingApproval
            "
            variant="outline"
            size="sm"
          >
            <RotateCw
              class="h-4 w-4 mr-2"
              :class="{ 'animate-spin': server.connectionState === ConnectionState.Connecting }"
            />
            Restart
          </Button>
        </div>
      </div>
    </header>

    <!-- Loading State -->
    <div
      v-if="isEditingServerName"
      class="flex items-center justify-center p-8 text-muted-foreground"
    >
      <Spinner size="md" />
    </div>

    <!-- Not Found -->
    <Alert v-if="!server && !mcpStore.isLoading && !isEditingServerName" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertTitle>Server Not Found</AlertTitle>
      <AlertDescription>The server "{{ serverName }}" could not be found.</AlertDescription>
    </Alert>

    <!-- Server Details -->
    <div v-if="server" class="flex-1 overflow-auto">
      <div class="space-y-4 pr-4 pb-4">
        <!-- Connection & Overview Card -->
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-sm font-semibold">Overview</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2">
            <div class="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span class="text-muted-foreground block mb-1">Status</span>
                <Badge
                  :variant="
                    server.connectionState === ConnectionState.Connected
                      ? 'default'
                      : server.connectionState === ConnectionState.Failed
                        ? 'destructive'
                        : 'outline'
                  "
                  class="text-xs"
                >
                  {{ server.connectionState }}
                </Badge>
              </div>
              <div v-if="connectionUptime">
                <span class="text-muted-foreground block mb-1">Uptime</span>
                <span class="font-medium tabular-nums">{{ connectionUptime }}</span>
              </div>
              <div>
                <span class="text-muted-foreground block mb-1">Transport</span>
                <span class="font-medium">{{
                  isServerConfig(server.config) ? server.config.type : 'Invalid Configuration'
                }}</span>
              </div>
              <div>
                <span class="text-muted-foreground block mb-1">Tools</span>
                <span class="font-medium tabular-nums">{{ tools.length }}</span>
              </div>
            </div>

            <Alert
              v-if="server.connectionState === ConnectionState.Failed && server.error"
              variant="destructive"
              class="mt-3"
            >
              <AlertCircle class="h-3 w-3" />
              <AlertTitle class="text-xs">Connection Error</AlertTitle>
              <AlertDescription class="text-xs">{{ server.error }}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <!-- Configuration Card -->
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-sm font-semibold">Configuration</CardTitle>
          </CardHeader>
          <CardContent v-if="isServerConfig(server.config)" class="space-y-3">
            <div v-if="isStdioConfig(server.config)" class="space-y-3">
              <div>
                <label class="text-xs text-muted-foreground block mb-1.5">Command</label>
                <code class="block text-xs bg-muted/50 p-2 rounded break-all">
                  {{ server.config.command }}
                  <span v-if="server.config.args" class="text-muted-foreground">
                    {{ server.config.args.join(' ') }}
                  </span>
                </code>
              </div>

              <div v-if="server.config.cwd">
                <label class="text-xs text-muted-foreground block mb-1.5">Working Directory</label>
                <code class="block text-xs bg-muted/50 p-2 rounded break-all">{{
                  server.config.cwd
                }}</code>
              </div>

              <div v-if="server.config.env">
                <label class="text-xs text-muted-foreground block mb-1.5"
                  >Environment Variables</label
                >
                <div class="text-xs bg-muted/50 p-2 rounded space-y-1">
                  <div v-for="(value, key) in server.config.env" :key="key">
                    <span class="text-muted-foreground">{{ key }}:</span> {{ value }}
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="space-y-3">
              <div>
                <label class="text-xs text-muted-foreground block mb-1.5">URL</label>
                <code class="block text-xs bg-muted/50 p-2 rounded break-all">{{
                  server.config.url
                }}</code>
              </div>

              <div v-if="'headers' in server.config && server.config.headers">
                <label class="text-xs text-muted-foreground block mb-1.5">Headers</label>
                <div class="text-xs bg-muted/50 p-2 rounded space-y-1">
                  <div v-for="(value, key) in server.config.headers" :key="key">
                    <span class="text-muted-foreground">{{ key }}:</span> {{ value }}
                  </div>
                </div>
              </div>

              <div v-if="'oauth2' in server.config && server.config.oauth2">
                <label class="text-xs text-muted-foreground block mb-1.5">OAuth2</label>
                <div class="text-xs bg-muted/50 p-2 rounded space-y-1">
                  <div>
                    <span class="text-muted-foreground">Client ID:</span>
                    {{ server.config.oauth2.clientId }}
                  </div>
                  <div v-if="server.config.oauth2.scopes">
                    <span class="text-muted-foreground">Scopes:</span>
                    {{ server.config.oauth2.scopes.join(', ') }}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
          <CardContent v-else>
            <Alert variant="destructive" class="border-dashed">
              <AlertCircle class="h-4 w-4" />
              <AlertTitle>Invalid Configuration</AlertTitle>
              <AlertDescription>This server has an invalid configuration.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <!-- Tools Section -->
        <Card>
          <CardHeader class="pb-3">
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <CardTitle class="text-sm font-semibold flex items-center gap-2">
                  <Wrench class="h-4 w-4" />
                  Tool Pre-Approval
                </CardTitle>
                <p class="text-xs text-muted-foreground mt-1">
                  Pre-approved tools can be used without human-in-the-loop confirmation
                </p>
              </div>
              <div class="flex items-center gap-2">
                <Button
                  v-if="tools.length > 0 && tools.some((t) => !t.isApproved)"
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs"
                  :disabled="mcpStore.isSavingApprovedTools"
                  @click="handleApproveAll"
                >
                  <CheckCheck class="h-3 w-3 mr-1" />
                  Approve All
                </Button>
                <Badge variant="secondary" class="text-xs">{{ tools.length }}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div v-if="tools.length > 0" class="space-y-0.5">
              <ToolCard
                v-for="tool in tools"
                :key="tool.name"
                :tool="tool"
                :show-server-name="false"
                :is-approved="tool.isApproved"
                :read-only="mcpStore.isSavingApprovedTools"
                @toggle="handleToolToggle"
              />
            </div>

            <Alert v-else variant="default" class="border-dashed">
              <Wrench class="h-4 w-4" />
              <AlertTitle class="text-sm">No Tools Available</AlertTitle>
              <AlertDescription class="text-xs">
                This server hasn't provided any tools yet. Try reconnecting the server.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <!-- Server Approval Section (workspace servers only) -->
        <Card v-if="isWorkspaceServer">
          <CardHeader class="pb-3">
            <CardTitle class="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck class="h-4 w-4" />
              Server Approval
            </CardTitle>
            <p class="text-xs text-muted-foreground mt-1">
              Controls whether this server is permitted to run
            </p>
          </CardHeader>
          <CardContent>
            <!-- Approved state -->
            <div
              v-if="
                server.connectionState === ConnectionState.Connected ||
                server.connectionState === ConnectionState.Connecting ||
                server.connectionState === ConnectionState.Authenticating ||
                server.connectionState === ConnectionState.Disconnected ||
                server.connectionState === ConnectionState.Failed
              "
              class="flex items-center justify-between gap-3"
            >
              <div class="flex items-center gap-2">
                <ShieldCheck class="h-4 w-4 text-green-600 shrink-0" />
                <div>
                  <p class="text-xs font-medium">Approved</p>
                  <p class="text-xs text-muted-foreground">
                    This server is trusted and permitted to run.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                class="shrink-0 text-xs"
                @click="handleRevokeDecision"
              >
                Revoke Approval
              </Button>
            </div>

            <!-- Rejected state -->
            <div
              v-else-if="server.connectionState === ConnectionState.Rejected"
              class="flex items-center justify-between gap-3"
            >
              <div class="flex items-center gap-2">
                <ShieldX class="h-4 w-4 text-destructive shrink-0" />
                <div>
                  <p class="text-xs font-medium">Rejected</p>
                  <p class="text-xs text-muted-foreground">
                    This server has been blocked from running.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                class="shrink-0 text-xs"
                @click="handleRevokeDecision"
              >
                Revoke Rejection
              </Button>
            </div>

            <!-- Pending state -->
            <div
              v-else-if="server.connectionState === ConnectionState.PendingApproval"
              class="flex items-center justify-between gap-3"
            >
              <div class="flex items-center gap-2">
                <ShieldQuestion class="h-4 w-4 text-yellow-600 shrink-0" />
                <div>
                  <p class="text-xs font-medium">Awaiting Decision</p>
                  <p class="text-xs text-muted-foreground">
                    Approve to allow this server to run, or reject to block it.
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  class="text-xs text-green-700 border-green-500/30 hover:bg-green-500/10 hover:text-green-700"
                  @click="handleApprove"
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  @click="handleReject"
                >
                  Reject
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Logs Section -->
        <LogViewer :server-name="server.name" :logs="mcpStore.logs" @clear="handleClearLogs" />
      </div>
    </div>

    <!-- Edit Server Modal -->
    <AddServerModal
      v-if="server"
      v-model:open="showEditModal"
      :workspace-config-path="mcpStore.workspaceConfigPath"
      :user-config-path="mcpStore.userConfigPath"
      :edit-mode="true"
      :existing-server="server"
      @save="handleSaveServer"
    />

    <!-- Destructive Save Warning for tool approval writes -->
    <DestructiveSaveWarningDialog
      :open="showApprovalDestructiveWarning"
      :title="approvalDialogTitle"
      :description="approvalDialogDescription"
      :confirm-button-text="approvalDialogButtonText"
      @confirm="confirmApprovalSave"
      @cancel="cancelApprovalSave"
    />
  </div>
</template>

<style scoped>
.server-detail {
  background: linear-gradient(to bottom, transparent, hsl(var(--muted) / 0.2));
}
</style>
