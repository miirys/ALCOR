<script setup lang="ts">
import { ref, computed, watch, provide } from 'vue';
import { Maximize2, Minimize2, Plus, AlertCircle, AlertTriangle } from 'lucide-vue-next';
import { EditorContent } from '@tiptap/vue-3';
import type { InlinePromptDefinition } from '../../../types';
import type { AvailableOutput } from '../../../utils/outputCatalog';
import type { BoundField } from './usePromptEditor';
import { usePromptEditor } from './usePromptEditor';
import { usePromptEditorSession, PROMPT_EDITOR_SESSION_KEY } from './usePromptEditorSession';
import MergeFieldSuggestionList from './MergeFieldSuggestionList.vue';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const props = defineProps<{
  modelValue?: InlinePromptDefinition;
  availableOutputs?: AvailableOutput[];
  /** varName → referencePath for existing parameter bindings */
  boundPaths?: Record<string, string>;
  editable?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: InlinePromptDefinition];
  'update:boundFields': [fields: BoundField[]];
}>();

const isMaximized = ref(false);
const maximizeTarget = ref<'system' | 'user'>('system');

const defaultPrompt: InlinePromptDefinition = {
  name: '',
  promptTemplate: { system: '', user: '' },
};

const prompt = ref<InlinePromptDefinition>(
  props.modelValue ? JSON.parse(JSON.stringify(props.modelValue)) : { ...defaultPrompt },
);

watch(
  () => props.modelValue,
  (val) => {
    if (val) prompt.value = JSON.parse(JSON.stringify(val));
  },
  { deep: true },
);

function updateField(field: 'system' | 'user', value: string) {
  prompt.value.promptTemplate[field] = value;
  emit('update:modelValue', prompt.value);
}

function handleCreate() {
  prompt.value = JSON.parse(JSON.stringify(defaultPrompt));
  emit('update:modelValue', prompt.value);
}

// ─── Shared refs ────────────────────────────────────────────────────────────

const outputsRef = computed(() => props.availableOutputs ?? []);
const boundPathsRef = computed(() => props.boundPaths ?? {});
const editableRef = computed(() => props.editable ?? true);
const systemContent = computed(() => prompt.value.promptTemplate.system);
const userContent = computed(() => prompt.value.promptTemplate.user);

// Cross-editor coordinator — owns the exclusive `activePillEdit`, the aggregated
// `siblingCounts`, and the rewire-all dispatch. Provided to descendant pill
// NodeViews via inject so they can render the total `{{varName}}` count.
const session = usePromptEditorSession();
provide(PROMPT_EDITOR_SESSION_KEY, session);

// ─── Editors ────────────────────────────────────────────────────────────────

// Track each editor's bound fields separately so we can merge them.
const systemBoundFields = ref<BoundField[]>([]);
const userBoundFields = ref<BoundField[]>([]);

function emitMergedFields() {
  const merged = new Map<string, BoundField>();
  for (const field of [...systemBoundFields.value, ...userBoundFields.value]) {
    const existing = merged.get(field.varName);
    if (!existing || (field.referencePath !== null && existing.referencePath === null)) {
      merged.set(field.varName, field);
    }
  }
  emit('update:boundFields', Array.from(merged.values()));
}

const systemSuggestionListRef = ref<InstanceType<typeof MergeFieldSuggestionList> | null>(null);
const userSuggestionListRef = ref<InstanceType<typeof MergeFieldSuggestionList> | null>(null);

const {
  editor: systemEditor,
  mergeFieldCount: systemCount,
  brokenCount: systemBroken,
  unknownCount: systemUnknown,
  suggestionsOpen: systemSuggestionsOpen,
  suggestionItems: systemSuggestionItems,
  triggerState: systemTriggerState,
  pillEditState: systemPillEditState,
  editingContext: systemEditingContext,
  insertMergeField: systemInsert,
  closeSuggestions: systemClose,
} = usePromptEditor({
  content: systemContent,
  availableOutputs: outputsRef,
  boundPaths: boundPathsRef,
  editable: editableRef,
  session,
  onUpdate: (v) => updateField('system', v),
  onBoundFieldsChange: (fields) => {
    systemBoundFields.value = fields;
    emitMergedFields();
  },
  onSuggestionKeyDown: (event) => systemSuggestionListRef.value?.onKeyDown(event) ?? false,
});

const {
  editor: userEditor,
  mergeFieldCount: userCount,
  brokenCount: userBroken,
  unknownCount: userUnknown,
  suggestionsOpen: userSuggestionsOpen,
  suggestionItems: userSuggestionItems,
  triggerState: userTriggerState,
  pillEditState: userPillEditState,
  editingContext: userEditingContext,
  insertMergeField: userInsert,
  closeSuggestions: userClose,
} = usePromptEditor({
  content: userContent,
  availableOutputs: outputsRef,
  boundPaths: boundPathsRef,
  editable: editableRef,
  session,
  onUpdate: (v) => updateField('user', v),
  onBoundFieldsChange: (fields) => {
    userBoundFields.value = fields;
    emitMergedFields();
  },
  onSuggestionKeyDown: (event) => userSuggestionListRef.value?.onKeyDown(event) ?? false,
});

// ─── Suggestion dropdown positioning ────────────────────────────────────────

// Dropdown dimensions must match MergeFieldSuggestionList (w-64 max-h-[280px])
const DROPDOWN_WIDTH = 256;
const DROPDOWN_MAX_HEIGHT = 280;
const DROPDOWN_GAP = 4;

function dropdownStyle(
  editor: ReturnType<typeof usePromptEditor>['editor']['value'],
  trigger: { active: boolean; range: { from: number; to: number } | null },
  pillEdit: { pos: number } | null,
): Record<string, string> {
  if (!editor) return {};
  const pos = trigger.active && trigger.range ? trigger.range.from : (pillEdit?.pos ?? undefined);
  if (pos === undefined) return {};
  const coords = editor.view.coordsAtPos(pos);

  // Flip above the caret if there isn't room below (common in maximized overlay)
  const spaceBelow = window.innerHeight - coords.bottom;
  const showAbove = spaceBelow < DROPDOWN_MAX_HEIGHT + DROPDOWN_GAP && coords.top > spaceBelow;
  const top = showAbove
    ? `${Math.max(8, coords.top - DROPDOWN_MAX_HEIGHT - DROPDOWN_GAP)}px`
    : `${coords.bottom + DROPDOWN_GAP}px`;

  // Clamp horizontally so the dropdown never spills off-screen
  const left = Math.min(Math.max(8, coords.left), window.innerWidth - DROPDOWN_WIDTH - 8);

  return {
    position: 'fixed',
    left: `${left}px`,
    top,
    zIndex: '200',
  };
}

// ─── Maximize ────────────────────────────────────────────────────────────────

function openMaximized(target: 'system' | 'user') {
  maximizeTarget.value = target;
  isMaximized.value = true;
}

function closeMaximized() {
  isMaximized.value = false;
}

// ─── Variable counter ────────────────────────────────────────────────────────

function variableLabel(count: number, broken: number, unknown: number): string {
  if (count === 0) return '';
  const base = count === 1 ? '1 variable' : `${count} variables`;
  const issues: string[] = [];
  if (broken > 0) issues.push(`${broken} broken`);
  if (unknown > 0) issues.push(`${unknown} unbound`);
  return issues.length > 0 ? `${base} · ${issues.join(', ')}` : base;
}

// ─── Aggregated issue summary ───────────────────────────────────────────────

const totalBroken = computed(() => systemBroken.value + userBroken.value);
const totalUnknown = computed(() => systemUnknown.value + userUnknown.value);

const issueMessages = computed(() => {
  const msgs: { text: string; level: 'error' | 'warning' }[] = [];
  if (totalBroken.value > 0) {
    msgs.push({
      text: `${totalBroken.value} variable${totalBroken.value > 1 ? 's have' : ' has'} a broken reference — the source node was removed or disconnected`,
      level: 'error',
    });
  }
  if (totalUnknown.value > 0) {
    msgs.push({
      text: `${totalUnknown.value} variable${totalUnknown.value > 1 ? 's are' : ' is'} unbound — click ${totalUnknown.value > 1 ? 'them' : 'it'} to wire to an upstream output`,
      level: 'warning',
    });
  }
  return msgs;
});
</script>

<template>
  <div class="space-y-4">
    <!-- Empty state -->
    <div v-if="!modelValue" class="rounded-lg border border-dashed border-border p-4 text-center">
      <p class="text-xs text-muted-foreground mb-3">No local prompt defined.</p>
      <Button size="sm" variant="secondary" class="gap-1.5" @click="handleCreate">
        <Plus class="w-3.5 h-3.5" />
        Create Prompt
      </Button>
    </div>

    <template v-else>
      <!-- ── System Prompt ──────────────────────────────────────────────── -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <Label class="text-[10px] font-normal uppercase tracking-wider text-muted-foreground/60">
            System Prompt
          </Label>
          <div class="flex items-center gap-2">
            <span
              v-if="systemCount > 0 || systemBroken > 0"
              class="text-[10px] text-muted-foreground"
              :class="
                (systemBroken > 0 || systemUnknown > 0) &&
                (systemBroken > 0 ? 'text-destructive' : 'text-amber-400')
              "
            >
              {{ variableLabel(systemCount, systemBroken, systemUnknown) }}
            </span>
            <button
              type="button"
              :aria-label="
                isMaximized && maximizeTarget === 'system' ? 'Minimize' : 'Maximize system prompt'
              "
              class="text-muted-foreground hover:text-foreground transition-colors"
              @click="openMaximized('system')"
            >
              <Maximize2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div class="relative">
          <EditorContent
            :editor="systemEditor"
            class="prompt-editor rounded-md border border-input bg-background/50 px-3 py-2 text-sm min-h-[80px] cursor-text focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-colors"
          />
          <!-- Suggestion dropdown -->
          <Teleport to="body">
            <div
              v-if="systemSuggestionsOpen"
              :style="dropdownStyle(systemEditor, systemTriggerState, systemPillEditState)"
            >
              <MergeFieldSuggestionList
                ref="systemSuggestionListRef"
                :items="systemSuggestionItems"
                :editing-context="systemEditingContext"
                :command="
                  (item) => {
                    systemInsert(item);
                  }
                "
                @close="systemClose"
              />
            </div>
          </Teleport>
        </div>
      </div>

      <!-- ── User Prompt ────────────────────────────────────────────────── -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <Label class="text-[10px] font-normal uppercase tracking-wider text-muted-foreground/60">
            User Prompt
          </Label>
          <div class="flex items-center gap-2">
            <span
              v-if="userCount > 0 || userBroken > 0"
              class="text-[10px] text-muted-foreground"
              :class="
                (userBroken > 0 || userUnknown > 0) &&
                (userBroken > 0 ? 'text-destructive' : 'text-amber-400')
              "
            >
              {{ variableLabel(userCount, userBroken, userUnknown) }}
            </span>
            <button
              type="button"
              :aria-label="
                isMaximized && maximizeTarget === 'user' ? 'Minimize' : 'Maximize user prompt'
              "
              class="text-muted-foreground hover:text-foreground transition-colors"
              @click="openMaximized('user')"
            >
              <Maximize2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div class="relative">
          <EditorContent
            :editor="userEditor"
            class="prompt-editor rounded-md border border-input bg-background/50 px-3 py-2 text-sm min-h-[100px] cursor-text focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-colors"
          />
          <!-- Suggestion dropdown -->
          <Teleport to="body">
            <div
              v-if="userSuggestionsOpen"
              :style="dropdownStyle(userEditor, userTriggerState, userPillEditState)"
            >
              <MergeFieldSuggestionList
                ref="userSuggestionListRef"
                :items="userSuggestionItems"
                :editing-context="userEditingContext"
                :command="
                  (item) => {
                    userInsert(item);
                  }
                "
                @close="userClose"
              />
            </div>
          </Teleport>
        </div>
      </div>

      <!-- Hint -->
      <p class="text-[10px] text-muted-foreground/50">
        Type <kbd class="font-mono bg-muted px-1 rounded">&#123;&#123;</kbd> to insert a variable
        reference.
      </p>

      <!-- Inline issue messages -->
      <div v-if="issueMessages.length > 0" class="space-y-1">
        <div
          v-for="(msg, idx) in issueMessages"
          :key="idx"
          class="flex items-start gap-1.5 text-[10px] leading-snug"
          :class="msg.level === 'error' ? 'text-destructive' : 'text-amber-400'"
        >
          <AlertCircle v-if="msg.level === 'error'" class="w-3 h-3 shrink-0 mt-px" />
          <AlertTriangle v-else class="w-3 h-3 shrink-0 mt-px" />
          <span>{{ msg.text }}</span>
        </div>
      </div>
    </template>

    <!-- ── Maximized overlay ─────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="isMaximized"
        class="fixed inset-0 z-[100] flex items-center justify-center p-3"
        @keydown.escape="closeMaximized"
      >
        <div class="absolute inset-0 bg-background/80 backdrop-blur-sm" @click="closeMaximized" />

        <div
          class="relative w-full max-w-3xl h-[70vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20 shrink-0"
          >
            <Label class="text-sm font-medium">
              {{ maximizeTarget === 'system' ? 'System Prompt' : 'User Prompt' }}
            </Label>
            <div class="flex items-center gap-2">
              <span
                v-if="(maximizeTarget === 'system' ? systemCount : userCount) > 0"
                class="text-xs text-muted-foreground"
                :class="
                  (maximizeTarget === 'system' ? systemBroken : userBroken) > 0 &&
                  'text-destructive'
                "
              >
                {{
                  variableLabel(
                    maximizeTarget === 'system' ? systemCount : userCount,
                    maximizeTarget === 'system' ? systemBroken : userBroken,
                    maximizeTarget === 'system' ? systemUnknown : userUnknown,
                  )
                }}
              </span>
              <Button variant="ghost" size="sm" class="gap-1.5" @click="closeMaximized">
                <Minimize2 class="w-3.5 h-3.5" />
                Done
              </Button>
            </div>
          </div>

          <!-- Editor -->
          <div class="flex-1 overflow-y-auto p-5">
            <EditorContent
              :editor="maximizeTarget === 'system' ? systemEditor : userEditor"
              class="prompt-editor h-full text-sm leading-relaxed"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.prompt-editor :deep(.ProseMirror) {
  outline: none;
  min-height: inherit;
}

.prompt-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--color-muted-foreground);
  opacity: 0.5;
  pointer-events: none;
  float: left;
  height: 0;
}

.prompt-editor :deep(.ProseMirror p) {
  margin: 0;
  line-height: 1.6;
}

.prompt-editor :deep(.ProseMirror p + p) {
  margin-top: 0.5rem;
}
</style>
