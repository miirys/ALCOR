<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  AlertCircle,
  RefreshCw,
  Search,
  FolderOpen,
  Plus,
  AlertTriangle,
  Server,
  X,
} from 'lucide-vue-next';
import { useMcpStore } from './stores/mcpStore';
import ServerCard from './components/ServerCard.vue';
import AddServerModal from './components/AddServerModal.vue';
import DestructiveSaveWarningDialog from './components/DestructiveSaveWarningDialog.vue';
import { useDestructiveSaveWarning } from './composables/useDestructiveSaveWarning';
import type { McpServerState, ServerName, ServerConfig } from './types/mcp';
import { isHttpConfig, isServerConfig, isSseConfig, isStdioConfig } from './types/mcp';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const route = useRoute();
const router = useRouter();
const mcpStore = useMcpStore();
const isReloading = ref(false);
const isRestarting = ref(false);
const searchQuery = ref('');
const showAddServerModal = ref(false);
const successMessage = ref('');
const showSuccessAlert = ref(false);

// Edit mode state
const isEditMode = ref(false);
const serverToEdit = ref<McpServerState | null>(null);

// Delete confirmation state
const showDeleteConfirmation = ref(false);
const serverToDelete = ref<{ name: ServerName; configSource?: string } | null>(null);

// Pending operation refs — set before calling triggerWithCheck so the
// composable's onConfirm callback can close over the right values.
const pendingSaveOperation = ref<{
  serverName: ServerName;
  config: ServerConfig;
  targetFile: 'workspace' | 'user';
  originalName?: ServerName;
} | null>(null);
const pendingDeleteServerName = ref<ServerName | null>(null);

// Extract workspace name from URI for display
const workspaceName = computed(() => {
  if (!mcpStore.workspaceUri) return null;

  try {
    const parts = mcpStore.workspaceUri.split('/');
    return parts[parts.length - 1] || parts[parts.length - 2];
  } catch {
    return mcpStore.workspaceUri;
  }
});

// Filter servers based on search query
const filteredServers = computed(() => {
  if (!searchQuery.value.trim()) {
    return mcpStore.servers;
  }

  const query = searchQuery.value.toLowerCase().trim();
  return mcpStore.servers.filter((server) => {
    // Ensure server config component exists
    if (!isServerConfig(server.config)) {
      return false;
    }

    // Search in server name
    if (server.name.toLowerCase().includes(query)) return true;

    // Search in server title
    if (server.serverInfo?.title?.toLowerCase().includes(query)) return true;

    // Search in connection type
    if (server.config.type.toLowerCase().includes(query)) return true;

    // Search in URL/command
    if (
      (isSseConfig(server.config) || isHttpConfig(server.config)) &&
      'url' in server.config &&
      String(server.config.url).toLowerCase().includes(query)
    )
      // eslint-disable-next-line nonblock-statement-body-position
      return true;
    if (
      isStdioConfig(server.config) &&
      'command' in server.config &&
      server.config.command.toLowerCase().includes(query)
    )
      // eslint-disable-next-line nonblock-statement-body-position
      return true;

    return false;
  });
});

// Handlers
async function handleRestartServer(serverName: ServerName) {
  isRestarting.value = true;
  try {
    await mcpStore.restartServer(serverName);
  } finally {
    isRestarting.value = false;
  }
}

function handleDeleteServer(serverName: ServerName) {
  // Find the server to get its config source
  const server = mcpStore.servers.find((s) => s.name === serverName);
  serverToDelete.value = {
    name: serverName,
    configSource: server?.configSource,
  };
  showDeleteConfirmation.value = true;
}

async function handleApproveServer(serverName: ServerName) {
  await mcpStore.approveServer(serverName);
}

async function handleRejectServer(serverName: ServerName) {
  await mcpStore.rejectServer(serverName);
}

async function handleRevokeServerDecision(serverName: ServerName) {
  await mcpStore.revokeServerDecision(serverName);
}

async function performDelete(serverName: ServerName) {
  try {
    await mcpStore.deleteServer(serverName);
    successMessage.value = `Server "${serverName}" deleted successfully`;
    showSuccessAlert.value = true;
    setTimeout(() => {
      showSuccessAlert.value = false;
    }, 5000);
  } catch {
    // Error is already handled by the store
  }
}

async function handleReloadAll() {
  isReloading.value = true;
  try {
    await mcpStore.reloadServers();
  } finally {
    isReloading.value = false;
  }
}

function handleDocClick() {
  window.open(
    'https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_clients/',
    '_blank',
  );
}

function handleAddServer() {
  isEditMode.value = false;
  serverToEdit.value = null;
  showAddServerModal.value = true;
}

async function handleEditServer(serverName: ServerName) {
  const server = mcpStore.servers.find((s) => s.name === serverName);
  if (server) {
    isEditMode.value = true;
    serverToEdit.value = server;
    await nextTick(); // Ensure state is updated before opening modal
    showAddServerModal.value = true;
  }
}

async function performSave(params: {
  serverName: ServerName;
  config: ServerConfig;
  targetFile: 'workspace' | 'user';
  originalName?: ServerName;
}) {
  const { serverName, config, targetFile, originalName } = params;

  try {
    // If editing and name changed, delete the old one first
    if (originalName && originalName !== serverName) {
      await mcpStore.deleteServer(originalName);
    }

    await mcpStore.saveServer(serverName, config, targetFile);

    const action = originalName ? 'updated' : 'added';
    successMessage.value = `Server "${serverName}" ${action} successfully`;
    showSuccessAlert.value = true;
    setTimeout(() => {
      showSuccessAlert.value = false;
    }, 5000);
  } catch {
    // Error is already handled by the store
  } finally {
    // Always close modal and reset state, even on error
    showAddServerModal.value = false;
    isEditMode.value = false;
    serverToEdit.value = null;
  }
}

// The config path to check changes depending on whether we're saving or deleting.
const destructiveCheckPath = computed<string | null>(() => {
  if (pendingSaveOperation.value) {
    const { targetFile } = pendingSaveOperation.value;
    return targetFile === 'workspace' ? mcpStore.workspaceConfigPath : mcpStore.userConfigPath;
  }
  if (pendingDeleteServerName.value) {
    return (
      mcpStore.servers.find((s) => s.name === pendingDeleteServerName.value)?.configSource ?? null
    );
  }
  return null;
});

const destructiveOperationType = computed(() => {
  return pendingDeleteServerName.value ? ('delete' as const) : ('save' as const);
});

const {
  showWarning: showDestructiveSaveWarning,
  dialogTitle: destructiveDialogTitle,
  dialogDescription: destructiveDialogDescription,
  dialogButtonText: destructiveDialogButtonText,
  triggerWithCheck: triggerDestructiveCheck,
  confirm: confirmDestructiveSave,
  cancel: cancelDestructiveSaveWarning,
} = useDestructiveSaveWarning({
  configPath: destructiveCheckPath,
  operationType: destructiveOperationType,
  onConfirm: async () => {
    if (pendingSaveOperation.value) {
      const params = pendingSaveOperation.value;
      pendingSaveOperation.value = null;
      await performSave(params);
      return;
    }
    if (pendingDeleteServerName.value) {
      const name = pendingDeleteServerName.value;
      pendingDeleteServerName.value = null;
      await performDelete(name);
    }
  },
});

function cancelDestructiveSave(): void {
  // Clear pending state so a subsequent operation doesn't pick up stale values
  pendingSaveOperation.value = null;
  pendingDeleteServerName.value = null;
  cancelDestructiveSaveWarning();
}

async function confirmDelete() {
  if (!serverToDelete.value) return;

  const { name } = serverToDelete.value;

  showDeleteConfirmation.value = false;
  serverToDelete.value = null;

  pendingDeleteServerName.value = name;
  await triggerDestructiveCheck();
}

async function handleSaveServer(
  ...args: [ServerName, ServerConfig, 'workspace' | 'user', ServerName?]
) {
  const [serverName, config, targetFile, originalName] = args;

  pendingSaveOperation.value = { serverName, config, targetFile, originalName };
  await triggerDestructiveCheck();
}

// Watch for edit query parameter from server detail page
watch(
  () => route.query.edit,
  async (serverNameToEdit) => {
    if (serverNameToEdit && typeof serverNameToEdit === 'string') {
      // Ensure servers are loaded before trying to edit
      if (mcpStore.servers.length === 0) {
        await mcpStore.loadData();
      }

      // Verify the server exists before opening edit modal
      const server = mcpStore.getServerByName(serverNameToEdit as ServerName);
      if (server) {
        handleEditServer(serverNameToEdit as ServerName);
      }
      // Clear the query parameter
      router.replace({ query: {} });
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="mcp-dashboard h-full flex flex-col p-6 space-y-4">
    <!-- Header -->
    <header class="space-y-1">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div>
            <h1 class="text-xl font-bold">MCP Servers</h1>
            <p
              v-if="workspaceName"
              class="text-sm text-muted-foreground flex items-center gap-1 mt-1"
            >
              <FolderOpen class="h-3 w-3" />
              {{ workspaceName }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button
            @click="handleAddServer"
            :disabled="isReloading || isRestarting"
            variant="default"
            size="sm"
          >
            <Plus class="h-4 w-4 mr-2" />
            Add Server
          </Button>
          <Button
            @click="handleReloadAll"
            :disabled="isReloading || isRestarting"
            variant="outline"
            size="sm"
          >
            <RefreshCw class="h-4 w-4 mr-2" :class="{ 'animate-spin': isReloading }" />
            Reload Config
          </Button>
        </div>
      </div>
    </header>

    <!-- No Workspace Warning -->
    <Alert
      v-if="!mcpStore.workspaceUri && !mcpStore.isLoading"
      variant="default"
      class="border-dashed"
    >
      <AlertCircle class="h-4 w-4" />
      <AlertTitle>No Workspace Detected</AlertTitle>
      <AlertDescription>
        MCP servers require a workspace folder to load configuration. Please open a folder in your
        editor.
      </AlertDescription>
    </Alert>

    <!-- Pending Approval Banner -->
    <Alert
      v-if="mcpStore.pendingServers.length > 0"
      variant="default"
      class="border-yellow-500/50 bg-yellow-500/5"
    >
      <AlertCircle class="h-4 w-4 text-yellow-600" />
      <AlertTitle class="text-yellow-700">MCP Servers Awaiting Approval</AlertTitle>
      <AlertDescription class="text-yellow-700/80">
        {{ mcpStore.pendingServers.length }} MCP server(s) are waiting for your approval before they
        can run. Review the cards below and click Approve or Reject.
      </AlertDescription>
    </Alert>

    <!-- Search -->
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input v-model="searchQuery" placeholder="Search servers..." class="pl-9 h-9" />
    </div>

    <!-- Servers Grid -->
    <div class="flex-1 overflow-auto">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-4">
        <ServerCard
          v-for="server in filteredServers"
          :key="server.name"
          :server="server"
          :tool-count="mcpStore.getToolsForServer(server.name).length"
          :approved-tool-count="
            mcpStore.getToolsForServer(server.name).filter((t) => t.isApproved).length
          "
          :workspace-uri="mcpStore.workspaceUri"
          @restart="handleRestartServer"
          @edit="handleEditServer"
          @delete="handleDeleteServer"
          @approve="handleApproveServer"
          @reject="handleRejectServer"
          @revoke-decision="handleRevokeServerDecision"
        />
      </div>

      <!-- Empty State - No Servers -->
      <div
        v-if="mcpStore.servers.length === 0 && !mcpStore.isLoading && mcpStore.workspaceUri"
        class="flex flex-col items-center justify-center py-16 text-center"
      >
        <Server class="h-12 w-12 text-muted-foreground mb-4" />
        <h3 class="font-semibold mb-2">No MCP Servers Configured</h3>
        <p class="text-sm text-muted-foreground mb-4 max-w-md">
          No MCP servers found in your workspace configuration.
        </p>
        <Alert class="mb-4 border-dashed max-w-md">
          <AlertCircle class="h-4 w-4" />
          <AlertTitle class="text-sm">How to Configure MCP Servers</AlertTitle>
          <AlertDescription class="text-xs block">
            Create a
            <code class="inline whitespace-nowrap text-xs bg-muted px-1 rounded"
              >.gitlab/duo/mcp.json</code
            >
            file in your workspace to configure MCP servers. See the
            <a
              href="https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_clients/"
              @click.prevent="handleDocClick"
              class="underline hover:no-underline cursor-pointer"
              >documentation</a
            >
            for examples.
          </AlertDescription>
        </Alert>
      </div>

      <!-- Empty State - No Search Results -->
      <div
        v-else-if="filteredServers.length === 0 && searchQuery"
        class="flex flex-col items-center justify-center py-16 text-center"
      >
        <Search class="h-12 w-12 text-muted-foreground mb-4" />
        <h3 class="font-semibold mb-2">No servers found</h3>
        <p class="text-sm text-muted-foreground mb-4">No servers match "{{ searchQuery }}"</p>
        <Button @click="searchQuery = ''" variant="outline" size="sm"> Clear search </Button>
      </div>
    </div>

    <!-- Add Server Modal -->
    <AddServerModal
      v-model:open="showAddServerModal"
      :workspace-config-path="mcpStore.workspaceConfigPath"
      :user-config-path="mcpStore.userConfigPath"
      :edit-mode="isEditMode"
      :existing-server="serverToEdit ?? undefined"
      @save="handleSaveServer"
    />

    <!-- Delete Confirmation Dialog -->
    <Dialog v-model:open="showDeleteConfirmation">
      <DialogContent>
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <AlertTriangle class="h-5 w-5 text-destructive" />
            Delete MCP Server?
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. The server configuration will be permanently removed from
            your config file.
          </DialogDescription>
        </DialogHeader>

        <div v-if="serverToDelete" class="py-4 space-y-3">
          <div class="bg-muted p-3 rounded-md space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Server:</span>
              <code class="font-semibold">{{ serverToDelete.name }}</code>
            </div>
            <div v-if="serverToDelete.configSource" class="flex justify-between text-sm">
              <span class="text-muted-foreground">Location:</span>
              <code class="text-xs">{{ serverToDelete.configSource }}</code>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showDeleteConfirmation = false"> Cancel </Button>
          <Button variant="destructive" @click="confirmDelete"> Delete Server </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Destructive Save Warning Dialog -->
    <DestructiveSaveWarningDialog
      :open="showDestructiveSaveWarning"
      :title="destructiveDialogTitle"
      :description="destructiveDialogDescription"
      :confirm-button-text="destructiveDialogButtonText"
      @confirm="confirmDestructiveSave"
      @cancel="cancelDestructiveSave"
    />

    <!-- Simple Toast Notification -->
    <Transition name="toast">
      <div
        v-if="showSuccessAlert || mcpStore.error"
        class="fixed top-4 right-4 z-50 min-w-[300px] max-w-[400px] rounded-md border px-4 py-3 shadow-lg"
        :class="
          showSuccessAlert
            ? 'bg-green-50 border-green-200 text-green-900'
            : 'bg-red-50 border-red-200 text-red-900'
        "
      >
        <div class="flex items-start gap-3">
          <AlertCircle class="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div class="flex-1 text-sm">
            <p class="font-medium">{{ showSuccessAlert ? 'Success' : 'Error' }}</p>
            <p class="text-xs mt-1 opacity-90">
              {{ showSuccessAlert ? successMessage : mcpStore.error }}
            </p>
          </div>
          <button
            v-if="!showSuccessAlert"
            @click="mcpStore.clearError()"
            class="flex-shrink-0 opacity-70 hover:opacity-100"
            aria-label="Dismiss error"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.mcp-dashboard {
  background: linear-gradient(to bottom, transparent, hsl(var(--muted) / 0.2));
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-1rem);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(1rem);
}
</style>
