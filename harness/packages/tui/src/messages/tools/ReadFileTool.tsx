import React from 'react';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool } from './BaseTool';
import type { ToolComponentProps, ReadFileInput } from './types';

function formatRangeLabel(offset?: number, limit?: number): string {
  if (offset == null && limit == null) return '';
  const start = (offset ?? 0) + 1;
  const end = limit != null ? (offset ?? 0) + limit : 'end';
  return `:${start}–${end}`;
}

export const ReadFileTool: React.FC<ToolComponentProps<ReadFileInput>> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const label = `→ Read ${input.filepath}${formatRangeLabel(input.offset, input.limit)}`;

  return <BaseTool label={label} state={state} expanded={expanded} columns={columns} />;
};
