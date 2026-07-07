import { extractUiChatLog, type ChatLog, type DuoWorkflowEvent } from '@gitlab-lsp/workflow-api';

/** The checkpoint-bearing subset of a workflow event that this module reads. */
type CheckpointEvent = { checkpoint: string };

const asEvent = (event: CheckpointEvent): DuoWorkflowEvent => event as unknown as DuoWorkflowEvent;

/**
 * Maps a workflow checkpoint's `ui_chat_log` to billable LLM calls.
 *
 * Why this shape: workflow-api exposes NO lower-level per-model-call event
 * (no `llm_request` / `model_call_completed`), so the billable unit has to be
 * inferred from the checkpoint frames. The checkpoint log is CUMULATIVE — each
 * `newCheckpoint` carries the full conversation so far — so a stateful tracker
 * only attributes the frames that are new since the last checkpoint.
 *
 * A billable LLM call is:
 *   - an `agent` message   (an assistant model response), OR
 *   - a `request` frame with `tool_info` (a model-DECIDED tool call).
 * A `tool` frame is the tool RESULT (a callback, not a new model call) and a
 * `user` frame is input — neither is counted. This makes a tool-using turn
 * (agent_step → tool_call → tool_result → agent_step) count the ≥2 real model
 * calls it actually cost, instead of the ≤1 new agent message it shows.
 */
export function isBillableFrame(entry: ChatLog): boolean {
  if (entry.message_type === 'agent') return true;
  // A model-driven tool call: a `request` carrying tool_info. Plan-approval
  // requests have tool_info === null and are not model calls.
  if (entry.message_type === 'request' && entry.tool_info != null) return true;
  return false;
}

/** Pull a stable checkpoint id out of the raw checkpoint JSON (`id`, else `ts`). */
export function checkpointIdOf(rawCheckpoint: string): string {
  try {
    const parsed = JSON.parse(rawCheckpoint) as { id?: string; ts?: string };
    return parsed.id ?? parsed.ts ?? 'cp';
  } catch {
    return 'cp';
  }
}

export interface BillableCall {
  /** stable dedupe id: `${workflowId}:${checkpointId}:${indexInCheckpoint}`. */
  callId: string;
  /** absolute index of the frame in the cumulative ui_chat_log. */
  index: number;
}

/**
 * Tracks how many `ui_chat_log` frames have already been attributed per
 * workflow so each new billable frame is counted exactly once across the
 * cumulative checkpoint stream.
 */
export class CheckpointAttributionTracker {
  #processed = new Map<string, number>();

  /**
   * Seed the baseline for a RESUMED workflow so its already-counted history
   * isn't re-attributed. Call once, on the first checkpoint of a resume.
   */
  seedResume(event: CheckpointEvent, workflowId: string): void {
    if (this.#processed.has(workflowId)) return;
    const result = extractUiChatLog(asEvent(event));
    const len = result.isOk() ? result.value.length : 0;
    this.#processed.set(workflowId, len);
  }

  /**
   * Returns the billable calls introduced by THIS checkpoint (the delta since
   * the last one). Advances the per-workflow cursor.
   */
  framesToAttribute(event: { checkpoint: string }, workflowId: string): BillableCall[] {
    const result = extractUiChatLog(asEvent(event));
    if (result.isErr()) return [];
    const frames = result.value;
    const checkpointId = checkpointIdOf(event.checkpoint);
    const from = this.#processed.get(workflowId) ?? 0;
    const out: BillableCall[] = [];
    for (let i = from; i < frames.length; i += 1) {
      if (isBillableFrame(frames[i])) {
        out.push({ callId: `${workflowId}:${checkpointId}:${i}`, index: i });
      }
    }
    this.#processed.set(workflowId, frames.length);
    return out;
  }

  /** Forget a workflow's cursor (e.g. on completion) to bound memory. */
  forget(workflowId: string): void {
    this.#processed.delete(workflowId);
  }
}
