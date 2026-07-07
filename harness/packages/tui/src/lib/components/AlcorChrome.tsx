import React from 'react';
import { Box, Text } from 'ink';
import { diffLines } from 'diff';
import { colors } from '../colors';
import type {
  ChatElement,
  ContextUsage,
  GitLabRemoteInfo,
  McpPanelServerItem,
  AgenticChatAccessStatus,
} from '../../types';
import { ConnectionState } from '../../types';
import { AlcorLogo } from './GitLabLogo';
import { Spinner } from './Spinner';

const fmtTokens = (n: number): string =>
  n >= 1000 ? `${Math.round(n / 100) / 10}k`.replace('.0k', 'k') : String(n);

/** `CTX ▰▰▰▰▰▱▱▱▱▱ 136k/256k · 53%` — the ALCOR context meter. */
export const ContextMeter: React.FC<{ contextUsage?: ContextUsage }> = ({ contextUsage }) => {
  if (!contextUsage) return null;
  const { totalTokens, maxTokens } = contextUsage;
  if (!Number.isFinite(totalTokens) || !Number.isFinite(maxTokens) || maxTokens <= 0) return null;

  const ratio = Math.min(1, totalTokens / maxTokens);
  const percent = Math.round(ratio * 100);
  const filled = Math.round(ratio * 10);
  let color = colors.accentDim;
  if (percent >= 88) color = colors.red;
  else if (percent >= 70) color = colors.yellow;

  return (
    <Text>
      <Text dimColor>CTX </Text>
      <Text color={color}>{'▰'.repeat(filled)}</Text>
      <Text color={colors.faint}>{'▱'.repeat(10 - filled)}</Text>
      <Text dimColor>
        {' '}
        {fmtTokens(totalTokens)}/{fmtTokens(maxTokens)} · {percent}%
      </Text>
    </Text>
  );
};

/** Slim session header: `✦ ALCOR · cwd · project` left, context meter right. */
export const TopBar: React.FC<{
  cwd: string;
  gitlabRemoteInfo: GitLabRemoteInfo;
  contextUsage?: ContextUsage;
  columns: number;
}> = ({ cwd, gitlabRemoteInfo, contextUsage, columns }) => {
  const project = gitlabRemoteInfo.status === 'connected' ? gitlabRemoteInfo.gitlabPath : undefined;
  return (
    <Box width={columns} justifyContent="space-between" paddingX={1}>
      <Text wrap="truncate">
        <Text color={colors.accent}>✦ ALCOR</Text>
        <Text dimColor> · {cwd}</Text>
        {project && <Text color={colors.accentDim}> · ⑂ {project}</Text>}
      </Text>
      <ContextMeter contextUsage={contextUsage} />
    </Box>
  );
};

/** Empty-session hero: wordmark, tagline, and connection facts, ALCOR-style. */
export const Hero: React.FC<{
  version?: string;
  username?: string;
  credentialSource?: string;
  agenticChatAccess?: AgenticChatAccessStatus;
  gitlabRemoteInfo: GitLabRemoteInfo;
  cwd: string;
  initializing: boolean;
}> = ({
  version,
  username,
  credentialSource,
  agenticChatAccess,
  gitlabRemoteInfo,
  cwd,
  initializing,
}) => {
  const access = agenticChatAccess?.status;
  const project = gitlabRemoteInfo.status === 'connected' ? gitlabRemoteInfo.gitlabPath : undefined;
  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <AlcorLogo />
      <Box marginTop={1}>
        <Text>
          <Text color={colors.accentDim}>✦ </Text>
          <Text dimColor>{version ? `v${version} · ` : ''}</Text>
          <Text color={colors.faint}>The seeing test</Text>
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor wrap="truncate">
          {username ? `@${username.replace(/^@/, '')}` : '…'}
          {credentialSource ? ` (${credentialSource})` : ''}
          {' · '}
          {access === 'available' && <Text color={colors.green}>✓ Duo</Text>}
          {access === 'unavailable' && <Text color={colors.red}>✗ Duo</Text>}
          {(!access || access === 'checking') && '… Duo'}
          {' · '}
          {project ?? cwd}
        </Text>
        {gitlabRemoteInfo.status === 'error' && (
          <Text color={colors.faint} wrap="truncate">
            {gitlabRemoteInfo.errorMessage}
          </Text>
        )}
      </Box>
      <Box marginTop={1}>
        {initializing ? (
          <Box>
            <Spinner changeColors spinner="line" />
            <Text dimColor> Initializing…</Text>
          </Box>
        ) : (
          <Text dimColor>Ask a question or hand ALCOR a task · / Commands · Tab Mode</Text>
        )}
      </Box>
    </Box>
  );
};

interface ChangeRow {
  status: 'M' | 'A' | 'D';
  path: string;
  add: number;
  del: number;
}

/** Collect a changed-files summary from the transcript's edit/create tool calls. */
export function collectChanges(elements: ChatElement[]): ChangeRow[] {
  const byPath = new Map<string, ChangeRow>();
  for (const el of elements) {
    if (el.type !== 'tool') continue;
    const { input } = el;
    if (input.tool === 'edit_file') {
      let add = 0;
      let del = 0;
      for (const part of diffLines(input.diff.old.content, input.diff.new.content)) {
        if (part.added) add += part.count ?? 0;
        else if (part.removed) del += part.count ?? 0;
      }
      const prev = byPath.get(input.filepath);
      byPath.set(input.filepath, {
        status: prev?.status === 'A' ? 'A' : 'M',
        path: input.filepath,
        add: (prev?.add ?? 0) + add,
        del: (prev?.del ?? 0) + del,
      });
    } else if (input.tool === 'create_file_with_contents') {
      byPath.set(input.filepath, {
        status: 'A',
        path: input.filepath,
        add: input.content.split('\n').length,
        del: 0,
      });
    }
  }
  return [...byPath.values()];
}

const DiffStat: React.FC<{ add: number; del: number }> = ({ add, del }) => (
  <Text>
    <Text color={colors.green}>+{add}</Text> <Text color={colors.red}>−{del}</Text>
  </Text>
);

/** Right-hand session sidebar: changes tree, MCP health, session tokens. */
export const SessionSidebar: React.FC<{
  elements: ChatElement[];
  contextUsage?: ContextUsage;
  mcpServers?: McpPanelServerItem[];
  width: number;
  height: number;
}> = ({ elements, contextUsage, mcpServers, width, height }) => {
  const changes = collectChanges(elements);
  const totalAdd = changes.reduce((a, c) => a + c.add, 0);
  const totalDel = changes.reduce((a, c) => a + c.del, 0);
  const inner = width - 4;
  const rule = '─'.repeat(Math.max(0, inner));
  const maxFiles = Math.max(1, height - 10 - (mcpServers?.length ?? 0));

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor={colors.border}
      paddingX={1}
      overflow="hidden"
    >
      <Box justifyContent="space-between">
        <Text color={colors.fg}>Changes</Text>
        {changes.length > 0 ? <DiffStat add={totalAdd} del={totalDel} /> : null}
      </Box>
      <Text color={colors.faint}>{rule}</Text>
      {changes.length === 0 && <Text dimColor>No changes yet</Text>}
      {changes.slice(-maxFiles).map((c) => {
        const sc = c.status === 'A' ? colors.green : c.status === 'D' ? colors.red : colors.yellow;
        const name = c.path.split('/').pop() ?? c.path;
        return (
          <Box key={c.path} justifyContent="space-between">
            <Text wrap="truncate">
              <Text color={sc}>{c.status} </Text>
              <Text color={colors.fg}>{name}</Text>
            </Text>
            <DiffStat add={c.add} del={c.del} />
          </Box>
        );
      })}

      {mcpServers && mcpServers.length > 0 && (
        <>
          <Box marginTop={1}>
            <Text color={colors.fg}>MCP</Text>
          </Box>
          <Text color={colors.faint}>{rule}</Text>
          {mcpServers.map((s) => (
            <Text key={s.name} wrap="truncate">
              {s.connectionState === ConnectionState.Connected ? (
                <Text color={colors.green}>● </Text>
              ) : (
                <Text color={colors.red}>○ </Text>
              )}
              <Text color={colors.fg}>{s.name}</Text>
            </Text>
          ))}
        </>
      )}

      <Box flexGrow={1} />
      {contextUsage && (
        <Text dimColor wrap="truncate">
          Session tokens · {fmtTokens(contextUsage.totalTokens)}
        </Text>
      )}
      <Text color={colors.faint} wrap="truncate">
        Ctrl+O · Expand traces
      </Text>
    </Box>
  );
};
