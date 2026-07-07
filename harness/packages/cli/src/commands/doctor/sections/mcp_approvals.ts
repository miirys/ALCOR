import type { McpServerApprovalStore } from '@gitlab-org/ai-configuration';

/**
 * Renders persisted MCP server approval decisions for the doctor report.
 *
 * The store keys decisions by a stable config hash (not server name), so we show
 * a hash prefix alongside each decision. This is sufficient for support/debug.
 */
export async function renderMcpApprovals(store: McpServerApprovalStore): Promise<string> {
  const entries = await store.list();
  const lines = ['## MCP Server Approvals'];

  if (entries.length === 0) {
    lines.push('No persisted MCP server approval decisions.');
    return lines.join('\n\n');
  }

  lines.push(
    entries.map(({ hash, decision }) => `- ${hash.slice(0, 12)}…  →  ${decision}`).join('\n'),
  );
  lines.push(
    'To change a decision: edit storage.json, remove the relevant entry under ' +
      'the MCP approvals key, then restart duo.',
  );

  return lines.join('\n\n');
}
