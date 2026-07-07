import type { Meta, StoryObj, VueRenderer } from '@storybook/vue3-vite';
import type { DecoratorFunction } from 'storybook/internal/csf';
import type { DuoMessage } from '@gitlab-org/graphql';
import { expect, fn } from 'storybook/test';
import { MOCK_AGENT_MESSAGE } from '../../mockData';
import AgentMessage from './AgentMessage.vue';
import piniaDecorator from '@/stories/piniaDecorator';

const RICH_MARKDOWN_MESSAGE: DuoMessage = {
  messageType: 'agent',
  toolInfo: null,
  content: [
    '# Heading level 1',
    '## Heading level 2',
    '### Heading level 3',
    '',
    'A paragraph with **bold**, _italic_, and `inline code`. Here is a [link](https://gitlab.com).',
    '',
    '- bullet one',
    '- bullet two',
    '  - nested bullet',
    '',
    '1. ordered first',
    '2. ordered second',
    '',
    '> A blockquote with a useful note.',
    '',
    '```ts',
    'function add(a: number, b: number): number {',
    '  return a + b;',
    '}',
    '```',
    '',
    '```bash',
    'npm install marked marked-highlight highlight.js dompurify',
    '```',
  ].join('\n'),
};

const SANITIZED_MESSAGE: DuoMessage = {
  messageType: 'agent',
  toolInfo: null,
  content: [
    'The renderer should sanitize raw HTML in agent output.',
    '',
    '<script>alert("xss")</script>',
    '',
    '<img src="x" onerror="alert(1)" />',
    '',
    '[malicious link](javascript:alert(1))',
  ].join('\n'),
};

const withEditorBackground =
  (color: string): DecoratorFunction<VueRenderer> =>
  (story) => ({
    components: { story },
    setup() {
      document.documentElement.style.setProperty('--editor-background', color);
    },
    template: '<story />',
  });

const meta = {
  title: 'duo-agent-platform/Messages/AgentMessage',
  component: AgentMessage,
  decorators: [piniaDecorator, withEditorBackground('#1e1e1e')],
  args: {
    onCopyMessage: fn(),
    onOpenUrl: fn(),
    onCopyCode: fn(),
    onInsertCode: fn(),
  },
  render: (args) => ({
    components: { AgentMessage },
    setup: () => ({ args }),
    template: `<AgentMessage
      :message="args.message"
      @copy-message="args.onCopyMessage"
      @open-url="args.onOpenUrl"
      @copy-code="args.onCopyCode"
      @insert-code="args.onInsertCode"
    />`,
  }),
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof AgentMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { message: MOCK_AGENT_MESSAGE },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Copy message' }));
    await expect(args.onCopyMessage).toHaveBeenCalledWith(MOCK_AGENT_MESSAGE.content);
  },
};

export const RichMarkdown: Story = {
  args: { message: RICH_MARKDOWN_MESSAGE },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('link', { name: 'link' }));
    await expect(args.onOpenUrl).toHaveBeenCalledWith('https://gitlab.com');
  },
};

const SINGLE_CODE_BLOCK = 'function add(a: number, b: number): number {\n  return a + b;\n}';

const CODE_BLOCK_MESSAGE: DuoMessage = {
  messageType: 'agent',
  toolInfo: null,
  content: ['Here is a helper you can use:', '', '```ts', SINGLE_CODE_BLOCK, '```'].join('\n'),
};

export const CodeActions: Story = {
  args: { message: CODE_BLOCK_MESSAGE },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Copy to clipboard' }));
    await expect(args.onCopyCode).toHaveBeenCalledWith(SINGLE_CODE_BLOCK);

    await userEvent.click(canvas.getByRole('button', { name: 'Insert at cursor' }));
    await expect(args.onInsertCode).toHaveBeenCalledWith(SINGLE_CODE_BLOCK);
  },
};

export const SanitizedHtml: Story = {
  args: { message: SANITIZED_MESSAGE },
};
