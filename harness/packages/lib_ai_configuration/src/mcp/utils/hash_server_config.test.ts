import type { SseServerConfig, ServerConfig } from '../config';
import { hashServerConfig } from './hash_server_config';

const baseConfig: ServerConfig = {
  type: 'stdio',
  command: 'node',
  args: ['server.js'],
  env: {},
};

describe('hashServerConfig', () => {
  it('produces a stable hash for the same config', () => {
    expect(hashServerConfig(baseConfig)).toBe(hashServerConfig(baseConfig));
  });

  it('produces different hashes for configs with different commands', () => {
    const other: ServerConfig = { ...baseConfig, command: 'python' };
    expect(hashServerConfig(baseConfig)).not.toBe(hashServerConfig(other));
  });

  it('is unaffected by key insertion order', () => {
    const a: ServerConfig = { type: 'stdio', command: 'node', args: [], env: { B: '2', A: '1' } };
    const b: ServerConfig = { type: 'stdio', command: 'node', args: [], env: { A: '1', B: '2' } };
    expect(hashServerConfig(a)).toBe(hashServerConfig(b));
  });

  it('produces a stable hash for a URL-bearing (SSE) config', () => {
    const config: SseServerConfig = {
      type: 'sse',
      url: new URL('http://example.com/sse'),
    };
    expect(hashServerConfig(config)).toBe(hashServerConfig(config));
  });

  it('produces the same hash whether url is a URL object or its string equivalent', () => {
    // Zod transforms url strings into URL objects after parsing, so both shapes
    // must hash identically to avoid spurious re-approval prompts.
    const withUrlObject: SseServerConfig = { type: 'sse', url: new URL('http://example.com/') };
    const withUrlString = { type: 'sse', url: 'http://example.com/' } as unknown as SseServerConfig;
    expect(hashServerConfig(withUrlObject)).toBe(hashServerConfig(withUrlString));
  });

  it('produces the same hash regardless of approvedTools value', () => {
    const noTools: ServerConfig = { ...baseConfig };
    const emptyTools: ServerConfig = { ...baseConfig, approvedTools: [] };
    const someTools: ServerConfig = { ...baseConfig, approvedTools: ['tool_a', 'tool_b'] };
    const allTools: ServerConfig = { ...baseConfig, approvedTools: true };

    const hash = hashServerConfig(noTools);
    expect(hashServerConfig(emptyTools)).toBe(hash);
    expect(hashServerConfig(someTools)).toBe(hash);
    expect(hashServerConfig(allTools)).toBe(hash);
  });
});
