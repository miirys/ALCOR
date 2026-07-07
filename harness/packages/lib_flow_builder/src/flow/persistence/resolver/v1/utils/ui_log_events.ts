import type { ComponentType } from '../schema';

// Mirrored from backend: agent/ui_log.py
const V1_AGENT_COMPONENT_UI_LOG_EVENTS = [
  'on_agent_final_answer',
  'on_tool_execution_success',
  'on_tool_execution_failed',
] as const;

// Mirrored from backend: one_off/ui_log.py
const V1_ONE_OFF_COMPONENT_UI_LOG_EVENTS = [
  'on_agent_final_answer',
  'on_tool_call_input',
  'on_tool_execution_success',
  'on_tool_execution_failed',
] as const;

// Mirrored from backend: deterministic_step/ui_log.py
const V1_DETERMINISTIC_STEP_COMPONENT_UI_LOG_EVENTS = [
  'on_tool_execution_success',
  'on_tool_execution_failed',
] as const;

const V1_UI_LOG_EVENTS_BY_COMPONENT_TYPE: Record<ComponentType, readonly string[]> = {
  AgentComponent: V1_AGENT_COMPONENT_UI_LOG_EVENTS,
  OneOffComponent: V1_ONE_OFF_COMPONENT_UI_LOG_EVENTS,
  DeterministicStepComponent: V1_DETERMINISTIC_STEP_COMPONENT_UI_LOG_EVENTS,
};

/**
 * Derive the correct `ui_log_events` for a V1 component type.
 *
 * The backend (duo_workflow_service) defines a fixed enum of loggable events
 * per component type. `UIHistory.pop_state_updates()` filters emitted events
 * against this list — only events present are written to `ui_chat_log`.
 */
export function deriveUiLogEvents(componentType: ComponentType): readonly string[] {
  return V1_UI_LOG_EVENTS_BY_COMPONENT_TYPE[componentType] || [];
}
