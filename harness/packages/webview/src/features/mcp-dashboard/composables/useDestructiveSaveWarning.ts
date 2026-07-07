/**
 * Composable for handling the destructive save warning flow.
 *
 * When a user tries to write to an MCP config file that was not created by the
 * dashboard (i.e. `_managed` is not true), we warn them that the operation will
 * strip comments and reformat the file.  The caller provides a `configPath` to
 * check and an `onConfirm` callback that runs the actual operation once the user
 * accepts the warning.
 *
 * Usage:
 *   const { showWarning, dialogTitle, dialogDescription, dialogButtonText,
 *           triggerWithCheck, confirm, cancel } = useDestructiveSaveWarning({
 *     configPath: computed(() => server.value?.configSource ?? null),
 *     operationType: computed(() => 'save'),
 *     onConfirm: () => doTheActualWrite(),
 *   });
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { useMcpStore } from '../stores/mcpStore';

export type DestructiveOperationType = 'save' | 'delete' | 'approveTools';

interface UseDestructiveSaveWarningOptions {
  /** Reactive path to the config file that will be written. Null skips the check. */
  configPath: Ref<string | null> | ComputedRef<string | null>;
  /** Controls dialog copy. Defaults to 'save'. */
  operationType?: Ref<DestructiveOperationType> | ComputedRef<DestructiveOperationType>;
  /** Called when the user confirms the destructive operation (or the file is already managed). */
  onConfirm: () => void | Promise<void>;
}

const TITLES: Record<DestructiveOperationType, string> = {
  save: 'Warning: File Will Be Reformatted',
  delete: 'Warning: File Will Be Reformatted (Delete)',
  approveTools: 'Warning: File Will Be Reformatted',
};

const DESCRIPTIONS: Record<DestructiveOperationType, string> = {
  save: 'This MCP configuration file was authored outside of the MCP Dashboard. Saving through the dashboard will reformat the file.',
  delete:
    'This MCP configuration file was authored outside of the MCP Dashboard. Deleting a server through the dashboard will reformat the file.',
  approveTools:
    'This MCP configuration file was authored outside of the MCP Dashboard. Updating tool approvals through the dashboard will reformat the file.',
};

const BUTTON_TEXTS: Record<DestructiveOperationType, string> = {
  save: 'Continue and Save',
  delete: 'Continue and Delete',
  approveTools: 'Continue and Update',
};

export function useDestructiveSaveWarning({
  configPath,
  operationType,
  onConfirm,
}: UseDestructiveSaveWarningOptions) {
  const mcpStore = useMcpStore();

  const showWarning = ref(false);

  const currentOperationType = computed<DestructiveOperationType>(
    () => operationType?.value ?? 'save',
  );

  const dialogTitle = computed(() => TITLES[currentOperationType.value]);
  const dialogDescription = computed(() => DESCRIPTIONS[currentOperationType.value]);
  const dialogButtonText = computed(() => BUTTON_TEXTS[currentOperationType.value]);

  /**
   * Check whether the config file is managed. If it is (or no path is
   * available), run `onConfirm` immediately. Otherwise show the warning dialog.
   * The caller is responsible for holding any pending state that `onConfirm` needs.
   */
  async function triggerWithCheck(): Promise<void> {
    const path = configPath.value;

    if (!path) {
      // No path to check — proceed directly
      await onConfirm();
      return;
    }

    let isManaged = false;
    try {
      isManaged = await mcpStore.isManagedConfig(path);
    } catch {
      // Default to unmanaged (show warning) so the user can still proceed
    }

    if (isManaged) {
      await onConfirm();
      return;
    }

    // File is unmanaged — show the dialog; confirm/cancel will call onConfirm
    showWarning.value = true;
  }

  async function confirm(): Promise<void> {
    showWarning.value = false;
    await onConfirm();
  }

  function cancel(): void {
    showWarning.value = false;
  }

  return {
    showWarning,
    dialogTitle,
    dialogDescription,
    dialogButtonText,
    triggerWithCheck,
    confirm,
    cancel,
  };
}
