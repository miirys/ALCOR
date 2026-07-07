import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { Text } from 'ink';
import { BaseTool, BASE_TOOL_CHROME_WIDTH } from './BaseTool';
import type { ToolState } from './types';

describe('BaseTool', () => {
  const successState: ToolState = { type: 'success', output: '' };

  describe('when rendering', () => {
    it('displays the label text', () => {
      const { lastFrame } = render(
        <BaseTool label="Test Label" state={successState} expanded={false} />,
      );

      expect(lastFrame()).toContain('Test Label');
    });
  });

  describe('when loading', () => {
    it('shows loading indicator', () => {
      const state: ToolState = { type: 'loading' };

      const { lastFrame } = render(<BaseTool label="Loading" state={state} expanded={false} />);

      expect(lastFrame()).toContain('◐');
    });
  });

  describe('when error', () => {
    it('shows error indicator and message', () => {
      const state: ToolState = { type: 'error', error: 'Something went wrong' };

      const { lastFrame } = render(<BaseTool label="Error" state={state} expanded={false} />);

      expect(lastFrame()).toContain('✗');
      expect(lastFrame()).toContain('Something went wrong');
    });
  });

  describe('when approval_request', () => {
    it('shows approval content', () => {
      const state: ToolState = {
        type: 'approval_request',
        content: 'Please approve this action',
        availableScopes: ['once'],
      };

      const { lastFrame } = render(<BaseTool label="Approval" state={state} expanded={false} />);

      expect(lastFrame()).toContain('?');
      expect(lastFrame()).toContain('Please approve this action');
    });
  });

  // describe('when showExpandHint is true', () => {
  //   describe('when not expanded', () => {
  //     it('shows expand hint', () => {
  //       const { lastFrame } = render(
  //         <BaseTool label="Test" state={successState} expanded={false} showExpandHint />,
  //       );

  //       expect(lastFrame()).toContain('Press Ctrl+O to expand');
  //     });
  //   });

  //   describe('when expanded', () => {
  //     it('shows collapse hint', () => {
  //       const { lastFrame } = render(
  //         <BaseTool label="Test" state={successState} expanded={true} showExpandHint />,
  //       );

  //       expect(lastFrame()).toContain('Press Ctrl+O to collapse');
  //     });
  //   });
  // });

  describe('when children are provided', () => {
    it('renders children content', () => {
      const { lastFrame } = render(
        <BaseTool label="Parent" state={successState} expanded={false}>
          <Text>Child Content</Text>
        </BaseTool>,
      );

      expect(lastFrame()).toContain('Child Content');
    });
  });

  describe('terminal width handling', () => {
    it('never exceeds the terminal width across narrow→wide terminals', () => {
      const longLabel =
        '← Create /very/long/nested/path/to/some/file/that/keeps/going/and/going/component.tsx';

      for (const columns of [30, 40, 60, 80, 120]) {
        const { lastFrame } = render(
          <BaseTool label={longLabel} state={successState} expanded={false} columns={columns}>
            <Text>x</Text>
          </BaseTool>,
        );
        const output = lastFrame() ?? '';
        const widest = Math.max(...output.split('\n').map((line) => line.length));
        expect(widest).toBeLessThanOrEqual(columns);
      }
    });

    it('wraps a long approval_request content within the terminal width', () => {
      const state: ToolState = {
        type: 'approval_request',
        content:
          'This is a long approval request explanation that should wrap rather than overflow the terminal when rendered on a narrow window.',
        availableScopes: ['once'],
      };

      const output =
        render(<BaseTool label="x" state={state} expanded={false} columns={40} />).lastFrame() ??
        '';
      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(40);
    });

    it('wraps a long error message within the terminal width', () => {
      const state: ToolState = {
        type: 'error',
        error:
          'Something went badly wrong while running this tool and the message keeps going for quite a long time without any breakable whitespace until eventually it ends.',
      };

      const output =
        render(<BaseTool label="x" state={state} expanded={false} columns={40} />).lastFrame() ??
        '';
      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(40);
    });
  });

  describe('chrome width', () => {
    // Pins BASE_TOOL_CHROME_WIDTH against the actual rendered chrome. If
    // someone changes borderLeft or paddingLeft on the outer Box without
    // updating the constant, downstream consumers (e.g. DiffLineContent) will
    // silently mis-size their content area. This test catches that drift.
    it('renders chrome whose width matches BASE_TOOL_CHROME_WIDTH', () => {
      const marker = 'MARKER';
      const { lastFrame } = render(
        <BaseTool label="x" state={successState} expanded={false}>
          <Text>{marker}</Text>
        </BaseTool>,
      );

      const markerRow = (lastFrame() ?? '').split('\n').find((r) => r.includes(marker)) ?? '';
      expect(markerRow.indexOf(marker)).toBe(BASE_TOOL_CHROME_WIDTH);
    });
  });
});
