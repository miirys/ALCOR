import { Injectable } from '@gitlab/needle';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { ToolInputFormatter } from './index';

/**
 * Formats `compaction` tool input so the TUI can render a friendly compaction
 * card. Compaction is performed by the backend; this maps the streamed args
 * into a display variant. This tool has no {@link WorkflowActionHandler}; its
 * display mapping lives here.
 */
@Injectable(ToolInputFormatter, [])
export class CompactionFormatter implements ToolInputFormatter {
  toolName = 'compaction';

  format(args: Record<string, unknown>): ToolInputDisplay {
    // The backend summarizes at least one message only when it actually
    // compacted; a zero (or absent) count means a no-op or failure.
    return {
      tool: 'compaction',
      trigger: typeof args.trigger === 'string' ? args.trigger : '',
      wasCompacted: Number(args.messages_summarized) > 0,
    };
  }
}
