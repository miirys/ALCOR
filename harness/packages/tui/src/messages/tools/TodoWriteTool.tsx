import React from 'react';
import { Box, Text } from 'ink';
import { BaseTool } from './BaseTool';
import type { ToolComponentProps, TodoWriteInput } from './types';

type TodoStatus = TodoWriteInput['todos'][number]['status'];

const STATUS_ICON: Record<TodoStatus, string> = {
  pending: '○',
  in_progress: '◎',
  completed: '●',
  cancelled: '⊘',
};

const STATUS_COLOR: Record<TodoStatus, string> = {
  pending: 'gray',
  in_progress: 'yellow',
  completed: 'green',
  cancelled: 'gray',
};

export const TodoWriteTool: React.FC<ToolComponentProps<TodoWriteInput>> = ({
  input,
  state,
  expanded,
}) => {
  return (
    <BaseTool label="Todos" state={state} expanded={expanded}>
      <Box flexDirection="column" paddingLeft={2}>
        {input.todos.map((todo, i) => (
          <Box key={`${todo.status}-${i}`} gap={1}>
            <Text color={STATUS_COLOR[todo.status]}>{STATUS_ICON[todo.status]}</Text>
            <Text
              strikethrough={todo.status === 'cancelled'}
              dimColor={todo.status === 'cancelled' || todo.status === 'completed'}
            >
              {todo.description}
            </Text>
          </Box>
        ))}
      </Box>
    </BaseTool>
  );
};
