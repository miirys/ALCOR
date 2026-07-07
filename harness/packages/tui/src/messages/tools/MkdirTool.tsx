import React from 'react';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool } from './BaseTool';
import type { ToolComponentProps, MkdirInput } from './types';

export const MkdirTool: React.FC<ToolComponentProps<MkdirInput>> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const label = `⊞ Mkdir · ${input.path}`;

  return <BaseTool label={label} state={state} expanded={expanded} columns={columns} />;
};
