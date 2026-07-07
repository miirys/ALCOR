import React from 'react';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool } from './BaseTool';
import type { ToolComponentProps, CompactionInput } from './types';

export const CompactionTool: React.FC<ToolComponentProps<CompactionInput>> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const { trigger, wasCompacted } = input;

  // The card is always a single label line. A no-op/failed compaction (nothing
  // was compacted) shows a short notice; the backend's paired agent message
  // carries the fuller explanation.
  let label: string;
  if (!wasCompacted) {
    label = 'Nothing to compact';
  } else if (trigger === 'auto') {
    label = 'Context auto-compacted to keep this session responsive';
  } else {
    label = 'Context compacted to keep this session responsive';
  }

  return <BaseTool label={label} state={state} expanded={expanded} columns={columns} />;
};
