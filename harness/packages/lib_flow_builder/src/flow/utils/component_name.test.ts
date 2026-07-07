import { toComponentName, fromComponentName } from './component_name';

describe('toComponentName', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(toComponentName('Code Analyzer')).toBe('code_analyzer');
  });

  it('strips disallowed characters', () => {
    expect(toComponentName('my-node (v2)')).toBe('mynode_v2');
  });

  it('collapses consecutive underscores', () => {
    expect(toComponentName('a__b___c')).toBe('a_b_c');
  });

  it('trims leading/trailing underscores', () => {
    expect(toComponentName('_leading_')).toBe('leading');
    expect(toComponentName('__a__')).toBe('a');
  });

  it('passes through already-valid snake_case names unchanged', () => {
    expect(toComponentName('step_one')).toBe('step_one');
  });

  it('returns empty string for all-special-character labels', () => {
    expect(toComponentName('---')).toBe('');
  });
});

describe('fromComponentName', () => {
  it('converts snake_case to Title Case with spaces', () => {
    expect(fromComponentName('code_analyzer')).toBe('Code Analyzer');
  });

  it('capitalizes single words', () => {
    expect(fromComponentName('analyzer')).toBe('Analyzer');
  });

  it('normalizes uppercase YAML names to title case', () => {
    expect(fromComponentName('CODE_ANALYZER')).toBe('Code Analyzer');
  });

  it('handles names with numbers', () => {
    expect(fromComponentName('step_2_runner')).toBe('Step 2 Runner');
  });

  it('handles empty string', () => {
    expect(fromComponentName('')).toBe('');
  });

  it('round-trips with toComponentName', () => {
    expect(toComponentName(fromComponentName('code_analyzer'))).toBe('code_analyzer');
    expect(toComponentName(fromComponentName('step_one'))).toBe('step_one');
    expect(toComponentName(fromComponentName('my_agent_v2'))).toBe('my_agent_v2');
  });
});
