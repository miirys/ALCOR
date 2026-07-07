import { cva } from 'class-variance-authority';
import { MessageType } from '../../types';

export const messageVariants = cva('flex gap-3 my-5', {
  variants: {
    variant: {
      user: 'bg-primary max-w-[80%] ml-auto rounded-3xl rounded-br-none',
      agent: 'text-secondary-foreground flex',
      request: '',
      tool: 'text-secondary-foreground',
    } satisfies Record<MessageType, string>,
  },
  defaultVariants: {
    variant: 'agent',
  },
});
