import React from 'react';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool } from './BaseTool';
import type { ToolComponentProps, ListDirInput } from './types';

export const ListDirTool: React.FC<ToolComponentProps<ListDirInput>> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const label = `⊟ List · ${input.directory}`;

  return <BaseTool label={label} state={state} expanded={expanded} columns={columns} />;
};
