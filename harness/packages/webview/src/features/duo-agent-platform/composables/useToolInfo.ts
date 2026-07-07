import { computed } from 'vue';
import type { Ref } from 'vue';

export function useToolInfo(toolInfoJson: Ref<string | null | undefined>) {
  const toolInfo = computed<Record<string, unknown> | null>(() => {
    if (!toolInfoJson.value) return null;
    try {
      const raw = JSON.parse(toolInfoJson.value) as {
        name?: string;
        args?: Record<string, unknown>;
        tool_response?: unknown;
      };
      if (!raw.name) return null;
      return {
        tool: raw.name,
        toolArgs: raw.args ?? {},
        toolResponse: raw.tool_response ?? null,
      };
    } catch {
      return null;
    }
  });

  const toolLabel = computed(() => String(toolInfo.value?.tool ?? '').replace(/_/g, ' '));

  return { toolInfo, toolLabel };
}
