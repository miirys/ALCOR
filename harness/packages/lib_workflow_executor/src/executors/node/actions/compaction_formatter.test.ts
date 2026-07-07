import { CompactionFormatter } from './compaction_formatter';

describe('CompactionFormatter', () => {
  const formatter = new CompactionFormatter();

  it('exposes the compaction tool name', () => {
    expect(formatter.toolName).toBe('compaction');
  });

  it('marks a real compaction as compacted', () => {
    const result = formatter.format({
      trigger: 'auto',
      messages_summarized: 12,
    });

    expect(result).toEqual({
      tool: 'compaction',
      trigger: 'auto',
      wasCompacted: true,
    });
  });

  it('treats a zero or missing count as not compacted, and a missing trigger as empty', () => {
    expect(formatter.format({})).toEqual({
      tool: 'compaction',
      trigger: '',
      wasCompacted: false,
    });

    expect(formatter.format({ trigger: 'manual', messages_summarized: 0 })).toEqual({
      tool: 'compaction',
      trigger: 'manual',
      wasCompacted: false,
    });
  });

  it('treats a non-string trigger as empty and a non-numeric count as not compacted', () => {
    const result = formatter.format({
      trigger: 42,
      messages_summarized: 'not-a-number',
    });

    expect(result).toEqual({
      tool: 'compaction',
      trigger: '',
      wasCompacted: false,
    });
  });

  it('accepts a numeric-string count', () => {
    const result = formatter.format({
      trigger: 'manual',
      messages_summarized: '5',
    });

    expect(result).toEqual({
      tool: 'compaction',
      trigger: 'manual',
      wasCompacted: true,
    });
  });
});
