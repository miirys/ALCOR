<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Wrench, CheckCircle, XCircle, AlertCircle } from 'lucide-vue-next';
import { useMcpStore } from '../stores/mcpStore';
import { useDestructiveSaveWarning } from '../composables/useDestructiveSaveWarning';
import DestructiveSaveWarningDialog from './DestructiveSaveWarningDialog.vue';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const route = useRoute();
const router = useRouter();
const mcpStore = useMcpStore();

const toolName = computed(() => route.params.toolName as string);
const tool = computed(() => mcpStore.tools.find((t) => t.name === toolName.value));

const parsedSchema = computed(() => {
  if (!tool.value) return null;
  try {
    return JSON.parse(tool.value.inputSchema);
  } catch {
    return null;
  }
});

const parameters = computed(() => {
  if (!parsedSchema.value?.properties) return [];
  return Object.entries(parsedSchema.value.properties).map(([key, value]: [string, any]) => ({
    name: key,
    type: value.type || 'unknown',
    description: value.description || '',
    required: parsedSchema.value.required?.includes(key) || false,
  }));
});

function goBack() {
  if (tool.value) {
    router.push(`/mcp/servers/${tool.value.serverName}`);
  } else {
    router.push('/mcp');
  }
}

// ===== Tool Approval =====

const isSavingApproval = ref(false);

const approvalConfigPath = computed(() => {
  if (!tool.value) return null;
  return mcpStore.getServerByName(tool.value.serverName)?.configSource ?? null;
});

// The toggled approval value — set before triggerWithCheck so onConfirm closes over it
const pendingApproved = ref<boolean | null>(null);

async function performToggleApproval(approved: boolean): Promise<void> {
  if (!tool.value) return;

  isSavingApproval.value = true;
  try {
    const serverTools = mcpStore.getToolsForServer(tool.value.serverName);
    const newApprovedList = serverTools
      .filter((t) => {
        return t.originalToolName === tool.value!.originalToolName ? approved : t.isApproved;
      })
      .map((t) => t.originalToolName);

    await mcpStore.saveApprovedTools(tool.value.serverName, newApprovedList);
  } finally {
    isSavingApproval.value = false;
    pendingApproved.value = null;
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
    if (pendingApproved.value !== null) {
      await performToggleApproval(pendingApproved.value);
    }
  },
});

async function handleToggleApproval(): Promise<void> {
  if (!tool.value) return;
  pendingApproved.value = !tool.value.isApproved;
  await triggerApprovalCheck();
}

onMounted(() => {
  // Scroll to top when component mounts
  const scrollContainer = document.querySelector('.tool-detail > .overflow-auto');
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }

  if (mcpStore.tools.length === 0) {
    mcpStore.loadData();
  }
});
</script>

<template>
  <div class="tool-detail h-full flex flex-col p-4 space-y-4">
    <!-- Header with Breadcrumb -->
    <header class="space-y-2">
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" @click="goBack" class="shrink-0">
          <ArrowLeft class="h-4 w-4" />
        </Button>
        <div class="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
          <button @click="router.push('/mcp')" class="hover:text-foreground transition-colors">
            MCP Dashboard
          </button>
          <span>/</span>
          <button
            v-if="tool"
            @click="router.push(`/mcp/servers/${tool.serverName}`)"
            class="hover:text-foreground transition-colors truncate"
          >
            {{ tool.serverName }}
          </button>
          <span v-if="tool">/</span>
          <span class="text-foreground font-medium truncate">{{
            tool?.originalToolName || toolName
          }}</span>
        </div>
      </div>

      <div v-if="tool" class="flex items-center gap-3 pl-12">
        <Wrench class="h-6 w-6 text-primary shrink-0" />
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-bold truncate">{{ tool.originalToolName }}</h1>
          <p class="text-sm text-muted-foreground">
            from <code class="bg-muted px-1 rounded">{{ tool.serverName }}</code>
          </p>
        </div>
      </div>
    </header>

    <!-- Not Found -->
    <Alert v-if="!tool && !mcpStore.isLoading" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertTitle>Tool Not Found</AlertTitle>
      <AlertDescription> The tool "{{ toolName }}" could not be found. </AlertDescription>
    </Alert>

    <!-- Tool Details -->
    <div v-if="tool" class="flex-1 overflow-auto">
      <div class="space-y-4 pr-4 pb-4">
        <!-- Overview Card -->
        <Card>
          <CardHeader>
            <div class="flex items-center justify-between">
              <CardTitle class="text-base">Overview</CardTitle>
              <div class="flex items-center gap-2">
                <Badge :variant="tool.isApproved ? 'default' : 'secondary'">
                  <component :is="tool.isApproved ? CheckCircle : XCircle" class="h-3 w-3 mr-1" />
                  {{ tool.isApproved ? 'Approved' : 'Not Approved' }}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs"
                  :disabled="isSavingApproval"
                  @click="handleToggleApproval"
                >
                  <component :is="tool.isApproved ? XCircle : CheckCircle" class="h-3 w-3 mr-1" />
                  {{ isSavingApproval ? 'Saving...' : tool.isApproved ? 'Unapprove' : 'Approve' }}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-3">
            <div>
              <label class="text-sm font-medium">Description</label>
              <p class="text-sm text-muted-foreground mt-1">
                {{ tool.description || 'No description available' }}
              </p>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground">Full Tool Name</span>
              <code class="text-xs bg-muted px-2 py-1 rounded">{{ tool.name }}</code>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground">Server</span>
              <Button
                variant="link"
                size="sm"
                class="h-auto p-0"
                @click="router.push(`/mcp/servers/${tool.serverName}`)"
              >
                {{ tool.serverName }}
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- Parameters Card -->
        <Card v-if="parameters.length > 0">
          <CardHeader>
            <CardTitle class="text-base">Parameters</CardTitle>
            <CardDescription>{{ parameters.length }} parameter(s)</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div
              v-for="param in parameters"
              :key="param.name"
              class="p-3 border rounded-lg space-y-1"
            >
              <div class="flex items-center justify-between">
                <code class="text-sm font-medium">{{ param.name }}</code>
                <div class="flex items-center gap-2">
                  <Badge variant="outline" class="text-xs">{{ param.type }}</Badge>
                  <Badge v-if="param.required" variant="default" class="text-xs">Required</Badge>
                </div>
              </div>
              <p v-if="param.description" class="text-xs text-muted-foreground">
                {{ param.description }}
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- Full Schema Card -->
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Input Schema</CardTitle>
            <CardDescription>Complete JSON schema definition</CardDescription>
          </CardHeader>
          <CardContent>
            <pre class="text-xs bg-muted p-3 rounded overflow-x-auto">{{
              parsedSchema ? JSON.stringify(parsedSchema, null, 2) : tool.inputSchema
            }}</pre>
          </CardContent>
        </Card>
      </div>
    </div>

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
.tool-detail {
  background: linear-gradient(to bottom, transparent, hsl(var(--muted) / 0.2));
}
</style>
