import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { CompactionTool } from './CompactionTool';
import type { CompactionInput, ToolState } from './types';

describe('CompactionTool', () => {
  const createInput = (overrides: Partial<CompactionInput> = {}): CompactionInput => ({
    tool: 'compaction',
    trigger: 'manual',
    wasCompacted: true,
    ...overrides,
  });

  const successState = (output: string): ToolState => ({ type: 'success', output });

  describe('success card', () => {
    it('shows the manual header when trigger is not auto', () => {
      const { lastFrame } = render(
        <CompactionTool
          input={createInput({ trigger: 'manual' })}
          state={successState('Summary text')}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('Context compacted to keep this session responsive');
      expect(lastFrame()).not.toContain('auto-compacted');
    });

    it('shows the auto header when trigger is auto', () => {
      const { lastFrame } = render(
        <CompactionTool
          input={createInput({ trigger: 'auto' })}
          state={successState('Summary text')}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('Context auto-compacted to keep this session responsive');
    });

    it('shows only the header, without token info or a summary', () => {
      const { lastFrame } = render(
        <CompactionTool
          input={createInput()}
          state={successState('A concise recap of the conversation.')}
          expanded={false}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain('Context compacted');
      expect(frame).not.toContain('token');
      expect(frame).not.toContain('→');
      expect(frame).not.toContain('A concise recap of the conversation.');
    });
  });

  describe('nothing to compact', () => {
    it('shows only the no-op label, without stats or a summary', () => {
      const { lastFrame } = render(
        <CompactionTool
          input={createInput({ wasCompacted: false })}
          state={successState('Nothing to compact')}
          expanded={false}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain('Nothing to compact');
      expect(frame).not.toContain('Context compacted');
    });
  });
});
