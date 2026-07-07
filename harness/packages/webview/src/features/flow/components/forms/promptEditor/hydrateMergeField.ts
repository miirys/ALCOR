import type { AvailableOutput } from '../../../utils/outputCatalog';
import type { MergeFieldAttrs } from './promptSerialization';
import { deriveVarName, createUnknownMergeFieldAttrs } from './extensions';

/** 'history' is always runtime-injected by the engine — never a user-wired input. */
const RUNTIME_VARS = new Set(['history']);

export interface HydrateContext {
  availableOutputs: AvailableOutput[];
  /** Pre-existing parameter bindings keyed by varName, used to restore path on load. */
  boundPaths?: Record<string, string>;
}

/**
 * Resolve a prompt template variable name to its display attributes.
 *
 * Resolution order:
 * 1. Runtime-injected (e.g. 'history') → status: 'runtime'
 * 2. varName IS a context path (legacy format) → look up directly in outputs
 * 3. varName matches an existing parameter binding → restore path, look up in outputs
 * 4. varName matches an available output's last path segment → status: 'valid'
 * 5. Plain unknown variable → status: 'unknown' (user must wire it in Inputs)
 */
export function hydrateMergeField(varName: string, ctx: HydrateContext): MergeFieldAttrs {
  // Runtime variables are always valid — no binding needed
  if (RUNTIME_VARS.has(varName)) {
    return {
      path: varName,
      varName,
      displayLabel: 'Conversation History',
      sourceNodeType: 'runtime',
      status: 'runtime',
    };
  }

  // Legacy format: full context path embedded directly in prompt text
  // e.g. {{context:step_one.result}} — look it up directly and derive a short varName
  if (varName.startsWith('context:')) {
    const output = ctx.availableOutputs.find((o) => o.path === varName);
    if (output) {
      return {
        path: varName,
        varName: deriveVarName(varName),
        displayLabel: output.label,
        sourceNodeType: output.sourceNodeType,
        status: 'valid',
      };
    }
    return { path: varName, varName, displayLabel: '', sourceNodeType: '', status: 'broken' };
  }

  // Restore a previously bound path from the node's parameter bindings
  const boundPath = ctx.boundPaths?.[varName];
  if (boundPath) {
    const output = ctx.availableOutputs.find((o) => o.path === boundPath);
    if (output) {
      return {
        path: boundPath,
        varName,
        displayLabel: output.label,
        sourceNodeType: output.sourceNodeType,
        status: 'valid',
      };
    }
    // Bound path no longer resolves — broken reference
    return {
      path: boundPath,
      varName,
      displayLabel: '',
      sourceNodeType: '',
      status: 'broken',
    };
  }

  // No existing binding — try to match by varName against output field names
  const output = ctx.availableOutputs.find(
    (o) => deriveVarName(o.path) === varName || o.path === varName,
  );
  if (output) {
    return {
      path: output.path,
      varName,
      displayLabel: output.label,
      sourceNodeType: output.sourceNodeType,
      status: 'valid',
    };
  }

  // Unresolved — user needs to configure this in the Inputs section
  return createUnknownMergeFieldAttrs(varName);
}
