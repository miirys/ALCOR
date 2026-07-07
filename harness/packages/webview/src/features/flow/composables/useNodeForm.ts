import { computed, type ComputedRef } from 'vue';
import type { Node, NodeConfig, ParameterBinding } from '../types';
import type { NodeBindingValidation } from '../utils/bindingValidation';
import type { AvailableOutput } from '../utils/outputCatalog';
import { buildAvailableOutputs } from '../utils/outputCatalog';
import { useFlow } from './useFlow';

/**
 * Shared logic for node property forms (Agent, AI Task, Tool).
 *
 * Encapsulates config access, validation lookup, binding mutations,
 * and upstream output resolution — the code that was duplicated
 * across all three form components.
 */
export function useNodeForm<T extends NodeConfig>(node: ComputedRef<Node>) {
  const {
    updateNode,
    flow,
    nodeTypeDefinitions,
    toolDefinitions,
    runtimeProvidedVariableDefinitions,
    getNodeValidation,
  } = useFlow();

  const config = computed(() => (node.value.config ?? {}) as Partial<T>);

  const validation = computed<NodeBindingValidation | undefined>(() =>
    getNodeValidation(node.value.id),
  );

  const availableOutputs = computed<AvailableOutput[]>(() =>
    buildAvailableOutputs(
      flow.value,
      node.value.id,
      nodeTypeDefinitions.value,
      toolDefinitions.value,
      runtimeProvidedVariableDefinitions.value,
    ),
  );

  function updateConfig(updates: Partial<T>) {
    updateNode(node.value.id, {
      config: { ...config.value, ...updates },
    });
  }

  function handleBindingUpdate(parameter: string, update: Partial<ParameterBinding>) {
    const existing =
      (config.value as { parameterBindings?: ParameterBinding[] }).parameterBindings ?? [];
    const idx = existing.findIndex((b) => b.parameter === parameter);

    const updated = [...existing];
    const prev = idx >= 0 ? updated[idx] : undefined;
    if (prev) {
      updated[idx] = { ...prev, ...update, parameter, kind: update.kind ?? prev.kind };
    } else {
      updated.push({ ...update, parameter, kind: update.kind ?? 'unbound' });
    }

    updateConfig({ parameterBindings: updated } as Partial<T>);
  }

  function handleBindingRemove(parameter: string) {
    const existing =
      (config.value as { parameterBindings?: ParameterBinding[] }).parameterBindings ?? [];
    const updated = existing.filter((b) => b.parameter !== parameter);
    updateConfig({ parameterBindings: updated } as Partial<T>);
  }

  return {
    config,
    validation,
    availableOutputs,
    updateConfig,
    handleBindingUpdate,
    handleBindingRemove,
  };
}
