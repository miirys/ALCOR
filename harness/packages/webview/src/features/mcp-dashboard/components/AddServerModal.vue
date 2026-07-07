<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Plus, AlertCircle, Save } from 'lucide-vue-next';
import type { ServerConfig, ServerName, McpServerState } from '../types/mcp';
import { isStdioConfig, isSseConfig, isHttpConfig } from '../types/mcp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  workspaceConfigPath: string | null;
  userConfigPath: string | null;
  editMode?: boolean;
  existingServer?: McpServerState;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  save: [
    serverName: ServerName,
    config: ServerConfig,
    targetFile: 'workspace' | 'user',
    originalName?: ServerName,
  ];
}>();

// Form state
const serverName = ref('');
const transportType = ref<'stdio' | 'sse' | 'http'>('stdio');
const targetFile = ref<'workspace' | 'user'>('workspace');

// Stdio fields
const command = ref('');
const args = ref('');
const env = ref('');

// SSE/HTTP fields
const url = ref('');

// Cached state per transport type to preserve user input when switching
const cachedStdioState = ref({ command: '', args: '', env: '' });
const cachedSseState = ref({ url: '' });
const cachedHttpState = ref({ url: '' });

// Validation
const validationError = ref('');
const isSaving = ref(false);

// Computed
const canSaveToWorkspace = computed(() => props.workspaceConfigPath !== null);
const canSaveToUser = computed(() => props.userConfigPath !== null);

const isUrlInvalid = computed(() => {
  if (transportType.value !== 'sse' && transportType.value !== 'http') return false;
  if (!url.value.trim()) return false;

  try {
    const parsedUrl = new URL(url.value.trim());
    return !parsedUrl;
  } catch {
    return true;
  }
});

const isValid = computed(() => {
  if (!serverName.value.trim()) return false;

  if (transportType.value === 'stdio') {
    return command.value.trim() !== '';
  }

  if (transportType.value === 'sse' || transportType.value === 'http') {
    if (!url.value.trim()) return false;

    // Validate URL format
    try {
      const parsedUrl = new URL(url.value.trim());
      return Boolean(parsedUrl);
    } catch {
      return false;
    }
  }

  return false;
});

function resetForm() {
  serverName.value = '';
  transportType.value = 'stdio';
  targetFile.value = canSaveToWorkspace.value ? 'workspace' : 'user';
  command.value = '';
  args.value = '';
  env.value = '';
  url.value = '';
  validationError.value = '';
  isSaving.value = false;

  // Clear cached states
  cachedStdioState.value = { command: '', args: '', env: '' };
  cachedSseState.value = { url: '' };
  cachedHttpState.value = { url: '' };
}

function populateForm(server: McpServerState) {
  serverName.value = server.name;

  const config = server.config as ServerConfig;
  if (isStdioConfig(config)) {
    transportType.value = 'stdio';
    command.value = config.command;
    // Format args as JSON array items (quoted and comma-separated) for proper parsing
    args.value = config.args ? config.args.map((arg) => JSON.stringify(arg)).join(', ') : '';
    env.value = config.env ? JSON.stringify(config.env) : '';
    // Update cache for stdio
    cachedStdioState.value = {
      command: command.value,
      args: args.value,
      env: env.value,
    };
  } else if (isSseConfig(config)) {
    transportType.value = 'sse';
    url.value = String(config.url);
    // Update cache for sse
    cachedSseState.value = { url: url.value };
  } else if (isHttpConfig(config)) {
    transportType.value = 'http';
    url.value = String(config.url);
    // Update cache for http
    cachedHttpState.value = { url: url.value };
  }

  // Determine target file from config source by comparing against actual config paths
  if (props.workspaceConfigPath && server.configSource === props.workspaceConfigPath) {
    targetFile.value = 'workspace';
  } else if (props.userConfigPath && server.configSource === props.userConfigPath) {
    targetFile.value = 'user';
  } else {
    // Fallback: default to workspace if available, otherwise user
    targetFile.value = canSaveToWorkspace.value ? 'workspace' : 'user';
  }

  // Reset loading and error state
  validationError.value = '';
  isSaving.value = false;
}

// Watch for modal open/close to reset/populate form
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (props.editMode && props.existingServer) {
        populateForm(props.existingServer);
      } else {
        resetForm();
      }
    }
  },
);

// Also watch for changes to existingServer while modal is already open
watch(
  () => props.existingServer,
  (server) => {
    if (props.open && props.editMode && server) {
      populateForm(server);
    }
  },
);

// Watch transport type to save/restore cached field values
watch(transportType, (newType, oldType) => {
  // Save current state to cache before switching
  if (oldType === 'stdio') {
    cachedStdioState.value = {
      command: command.value,
      args: args.value,
      env: env.value,
    };
  } else if (oldType === 'sse') {
    cachedSseState.value = { url: url.value };
  } else if (oldType === 'http') {
    cachedHttpState.value = { url: url.value };
  }

  // Restore cached state for new transport type
  if (newType === 'stdio') {
    command.value = cachedStdioState.value.command;
    args.value = cachedStdioState.value.args;
    env.value = cachedStdioState.value.env;
    url.value = '';
  } else if (newType === 'sse') {
    url.value = cachedSseState.value.url;
    command.value = '';
    args.value = '';
    env.value = '';
  } else if (newType === 'http') {
    url.value = cachedHttpState.value.url;
    command.value = '';
    args.value = '';
    env.value = '';
  }

  validationError.value = '';
});

function handleClose() {
  emit('update:open', false);
}

function buildConfig(): ServerConfig {
  if (transportType.value === 'stdio') {
    // Parse optional args
    let parsedArgs: string[] | undefined;
    if (args.value.trim()) {
      try {
        parsedArgs = JSON.parse(`[${args.value.trim()}]`);
      } catch {
        // If parsing fails, treat as single arg
        parsedArgs = [args.value.trim()];
      }
    }

    // Parse optional env
    let parsedEnv: Record<string, string> | undefined;
    if (env.value.trim()) {
      try {
        parsedEnv = JSON.parse(env.value.trim());
      } catch {
        validationError.value = 'Invalid JSON format for environment variables';
        throw new Error('Invalid env JSON');
      }
    }

    return {
      type: 'stdio' as const,
      command: command.value.trim(),
      ...(parsedArgs && { args: parsedArgs }),
      ...(parsedEnv && { env: parsedEnv }),
    };
  }

  if (transportType.value === 'sse' || transportType.value === 'http') {
    try {
      const parsedUrl = new URL(url.value.trim());

      if (transportType.value === 'sse') {
        return {
          type: 'sse' as const,
          url: parsedUrl,
        };
      }

      return {
        type: 'http' as const,
        url: parsedUrl,
      };
    } catch {
      validationError.value = 'Invalid URL format';
      throw new Error('Invalid URL');
    }
  }

  throw new Error('Invalid transport type');
}

async function handleSave() {
  validationError.value = '';

  if (!isValid.value) {
    validationError.value = 'Please fill in all required fields';
    return;
  }

  try {
    isSaving.value = true;
    const config = buildConfig();
    const originalName =
      props.editMode && props.existingServer ? props.existingServer.name : undefined;
    emit('save', serverName.value.trim() as ServerName, config, targetFile.value, originalName);
    // Note: isSaving will be reset when the modal closes via the watch on props.open
  } catch (error) {
    if (error instanceof Error && error.message !== 'Invalid env JSON') {
      validationError.value = error.message;
    }
    isSaving.value = false;
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(val) => emit('update:open', val)">
    <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ editMode ? 'Edit MCP Server' : 'Add MCP Server' }}</DialogTitle>
        <DialogDescription>
          {{
            editMode
              ? 'Update the server configuration below.'
              : 'Configure a new Model Context Protocol server. Choose the transport type and provide the required connection details.'
          }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-4">
        <!-- Server Name -->
        <div class="space-y-2">
          <Label for="server-name"> Server Name <span class="text-destructive">*</span> </Label>
          <Input
            id="server-name"
            v-model="serverName"
            placeholder="my-mcp-server"
            :disabled="isSaving"
          />
          <p class="text-xs text-muted-foreground">
            A unique identifier for this server (e.g., "filesystem", "git-tools")
          </p>
        </div>

        <!-- Transport Type -->
        <div class="space-y-2">
          <Label for="transport-type">
            Transport Type <span class="text-destructive">*</span>
          </Label>
          <Select v-model="transportType" :disabled="isSaving">
            <SelectTrigger id="transport-type">
              <SelectValue placeholder="Select transport type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">Local Process (stdio)</SelectItem>
              <SelectItem value="sse">Server-Sent Events (SSE)</SelectItem>
              <SelectItem value="http">HTTP</SelectItem>
            </SelectContent>
          </Select>
          <p class="text-xs text-muted-foreground">
            How the MCP server communicates with the client
          </p>
        </div>

        <!-- Stdio Configuration -->
        <template v-if="transportType === 'stdio'">
          <div class="space-y-2">
            <Label for="command"> Command <span class="text-destructive">*</span> </Label>
            <Input id="command" v-model="command" placeholder="npx" :disabled="isSaving" />
            <p class="text-xs text-muted-foreground">
              The executable command to run (e.g., "node", "python", "npx")
            </p>
          </div>

          <div class="space-y-2">
            <Label for="args">Arguments (optional)</Label>
            <Input
              id="args"
              v-model="args"
              placeholder='"-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"'
              :disabled="isSaving"
            />
            <p class="text-xs text-muted-foreground">
              Comma-separated JSON values (e.g., "-y", "arg2", "arg3")
            </p>
          </div>

          <div class="space-y-2">
            <Label for="env">Environment Variables (optional)</Label>
            <Input id="env" v-model="env" placeholder='{"API_KEY": "value"}' :disabled="isSaving" />
            <p class="text-xs text-muted-foreground">JSON object of environment variables</p>
          </div>
        </template>

        <!-- SSE/HTTP Configuration -->
        <template v-if="transportType === 'sse' || transportType === 'http'">
          <div class="space-y-2">
            <Label for="url"> URL <span class="text-destructive">*</span> </Label>
            <Input
              id="url"
              v-model="url"
              placeholder="https://example.com/mcp"
              :disabled="isSaving"
              :class="{ 'border-destructive focus-visible:ring-destructive': isUrlInvalid }"
            />
            <p v-if="isUrlInvalid" class="text-xs text-destructive">
              Please enter a valid URL (e.g., https://example.com/mcp)
            </p>
            <p v-else class="text-xs text-muted-foreground">The endpoint URL for the MCP server</p>
          </div>
        </template>

        <!-- Target File Selection -->
        <div class="space-y-2">
          <Label for="target-file"> Save To <span class="text-destructive">*</span> </Label>
          <Select v-model="targetFile" :disabled="isSaving">
            <SelectTrigger id="target-file">
              <SelectValue placeholder="Select config file" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="workspace" :disabled="!canSaveToWorkspace">
                Workspace Config
                <span v-if="!canSaveToWorkspace" class="text-muted-foreground">
                  (No workspace)
                </span>
              </SelectItem>
              <SelectItem value="user" :disabled="!canSaveToUser">
                User Config
                <span v-if="!canSaveToUser" class="text-muted-foreground"> (Not available) </span>
              </SelectItem>
            </SelectContent>
          </Select>
          <p class="text-xs text-muted-foreground">
            <span v-if="targetFile === 'workspace'">
              {{ workspaceConfigPath }}
            </span>
            <span v-else>
              {{ userConfigPath }}
            </span>
          </p>
        </div>

        <!-- Validation Error -->
        <Alert v-if="validationError" variant="destructive">
          <AlertCircle class="h-4 w-4" />
          <AlertDescription>{{ validationError }}</AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleClose" :disabled="isSaving"> Cancel </Button>
        <Button @click="handleSave" :disabled="!isValid || isSaving">
          <component :is="editMode ? Save : Plus" class="h-4 w-4 mr-2" />
          <template v-if="editMode">
            {{ isSaving ? 'Updating...' : 'Update Server' }}
          </template>
          <template v-else>
            {{ isSaving ? 'Adding...' : 'Add Server' }}
          </template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
