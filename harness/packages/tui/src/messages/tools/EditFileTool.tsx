import React from 'react';
import { createPatch } from 'diff';
import { Diff } from '../../lib/components/diff/Diff';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool, BASE_TOOL_CHROME_WIDTH } from './BaseTool';
import type { ToolComponentProps, EditFileInput } from './types';

export const EditFileTool: React.FC<ToolComponentProps<EditFileInput>> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const label = `← Edit ${input.filepath}`;

  const patch = React.useMemo(() => {
    if (input.diff.old.content === input.diff.new.content) {
      return '';
    }
    return createPatch(
      input.diff.old.filepath,
      input.diff.old.content,
      input.diff.new.content,
      '',
      '',
      { context: 3 },
    );
  }, [input.diff]);

  return (
    <BaseTool label={label} state={state} expanded={expanded} columns={columns}>
      <Diff
        patch={patch}
        oldFilepath={input.diff.old.filepath}
        newFilepath={input.diff.new.filepath}
        containerChromeWidth={BASE_TOOL_CHROME_WIDTH}
      />
    </BaseTool>
  );
};
