import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { McpTool } from './McpTool';
import type { McpToolInput, ToolState } from './types';

describe('McpTool', () => {
  const createInput = (
    serverName: string,
    name: string,
    args: Record<string, unknown> = {},
  ): McpToolInput => ({
    tool: 'mcp_tool',
    serverName,
    name,
    args,
  });

  const successState: ToolState = { type: 'success', output: '' };
  const createSuccessState = (output: string): ToolState => ({ type: 'success', output });

  describe('when rendering', () => {
    it('displays tool name and server name in the label', () => {
      const { lastFrame } = render(
        <McpTool
          input={createInput('gitlab', 'search_issues')}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('search_issues');
      expect(lastFrame()).toContain('gitlab');
    });

    it('shows compact args without an Input header', () => {
      const { lastFrame } = render(
        <McpTool
          input={createInput('gitlab', 'search_issues', { query: 'open bugs', project_id: '123' })}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).not.toContain('Input:');
      expect(lastFrame()).toContain('"query"');
      expect(lastFrame()).toContain('"open bugs"');
    });
  });

  describe('when successful with output', () => {
    it('shows output content without an Output header', () => {
      const { lastFrame } = render(
        <McpTool
          input={createInput('github', 'create_pr')}
          state={createSuccessState('PR created: #42')}
          expanded={false}
        />,
      );

      expect(lastFrame()).not.toContain('Output:');
      expect(lastFrame()).toContain('PR created: #42');
    });
  });

  describe('when args are long', () => {
    const longArgs = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`key${i}`, `value${i}`]),
    );

    describe('when not expanded', () => {
      it('renders a single truncated args line ending in an ellipsis', () => {
        const { lastFrame } = render(
          <McpTool
            input={createInput('gitlab', 'my_tool', longArgs)}
            state={successState}
            expanded={false}
            columns={80}
          />,
        );

        const frame = lastFrame() ?? '';
        expect(frame).toContain('…');
        // Compact args are inherently single-line; the truncated line should not
        // contain the last key.
        expect(frame).not.toContain('"key19"');
      });
    });

    describe('when expanded', () => {
      it('shows full pretty-printed args', () => {
        const { lastFrame } = render(
          <McpTool
            input={createInput('gitlab', 'my_tool', longArgs)}
            state={successState}
            expanded={true}
          />,
        );

        expect(lastFrame()).toContain('"key19"');
      });
    });
  });

  describe('when output is long', () => {
    const longOutput = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');

    describe('when not expanded', () => {
      it('shows truncated indicator', () => {
        const { lastFrame } = render(
          <McpTool
            input={createInput('gitlab', 'search_issues')}
            state={createSuccessState(longOutput)}
            expanded={false}
          />,
        );

        expect(lastFrame()).toContain('(truncated)');
      });
    });

    describe('when expanded', () => {
      it('shows full output without truncated indicator', () => {
        const { lastFrame } = render(
          <McpTool
            input={createInput('gitlab', 'search_issues')}
            state={createSuccessState(longOutput)}
            expanded={true}
          />,
        );

        expect(lastFrame()).not.toContain('(truncated)');
        expect(lastFrame()).toContain('line 9');
      });
    });
  });

  describe('when output is stringified JSON', () => {
    const jsonOutput = JSON.stringify({ search_results: [{ title: 'Duo', url: '/duo' }] });

    it('pretty-prints the JSON when expanded', () => {
      const { lastFrame } = render(
        <McpTool
          input={createInput('gitlab', 'documentation_search')}
          state={createSuccessState(jsonOutput)}
          expanded={true}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain('"search_results"');
      expect(frame).toContain('  "title": "Duo"');
    });

    it('shows readable indented lines rather than a single truncated blob when not expanded', () => {
      const { lastFrame } = render(
        <McpTool
          input={createInput('gitlab', 'documentation_search')}
          state={createSuccessState(jsonOutput)}
          expanded={false}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain('"search_results"');
    });
  });

  describe('when loading', () => {
    it('shows loading indicator', () => {
      const { lastFrame } = render(
        <McpTool
          input={createInput('gitlab', 'search_issues')}
          state={{ type: 'loading' }}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('...');
    });
  });

  describe('when args is empty object', () => {
    it('does not render an args line', () => {
      const { lastFrame } = render(
        <McpTool
          input={createInput('gitlab', 'list_issues', {})}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).not.toContain('{}');
      expect(lastFrame()).not.toContain('Input:');
    });
  });
});
