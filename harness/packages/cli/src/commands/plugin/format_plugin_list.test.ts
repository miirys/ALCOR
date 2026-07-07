import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { ListedPlugin } from '@gitlab-org/duo-plugin-marketplace/node';
import { formatPluginList } from './format_plugin_list';

function makePlugin(overrides: Partial<ListedPlugin> = {}): ListedPlugin {
  return {
    id: 'plugin@marketplace',
    version: '1.0.0',
    scope: 'user',
    enabled: true,
    installPath: '/path/to/plugin',
    installedAt: '2026-01-01T00:00:00.000Z',
    lastUpdated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('formatPluginList', () => {
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
  });

  describe('when the list is empty', () => {
    it('returns the empty-state message', () => {
      const lines = formatPluginList([]);
      expect(lines).toEqual([
        'No plugins installed. Use `duo plugin install` to install a plugin.',
      ]);
    });
  });

  describe('when there is a single enabled plugin', () => {
    it('returns header, scope group, and plugin block', () => {
      const plugin = makePlugin({ id: 'gitlab-helper@duo-demo', version: '1.2.0', enabled: true });
      const lines = formatPluginList([plugin]);
      expect(lines).toEqual([
        'Installed plugins:',
        '',
        'user',
        '  ❯ gitlab-helper@duo-demo',
        '    Version: 1.2.0',
        '    Status: ✔ enabled',
      ]);
    });
  });

  describe('when there is a disabled plugin', () => {
    it('shows ✘ disabled status', () => {
      const plugin = makePlugin({ enabled: false });
      const lines = formatPluginList([plugin]);
      expect(lines).toContain('    Status: ✘ disabled');
    });
  });

  describe('when TTY is true', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    });

    it('wraps scope headers in ANSI bold', () => {
      const plugin = makePlugin();
      const lines = formatPluginList([plugin]);
      const header = lines.find((l) => l.includes('user'));
      expect(header).toBe('\x1b[1muser\x1b[0m');
    });
  });

  describe('when TTY is false', () => {
    it('uses plain scope headers with no ANSI', () => {
      const plugin = makePlugin();
      const lines = formatPluginList([plugin]);
      expect(lines).toContain('user');
      expect(lines.some((l) => l.includes('\x1b'))).toBe(false);
    });
  });

  describe('when plugins span multiple scopes', () => {
    it('groups by scope with a header per scope and blank line between groups', () => {
      const userPlugin = makePlugin({ id: 'a@mkt', scope: 'user' });
      const projectPlugin = makePlugin({ id: 'b@mkt', scope: 'project' });
      const lines = formatPluginList([userPlugin, projectPlugin]);
      expect(lines).toEqual([
        'Installed plugins:',
        '',
        'user',
        '  ❯ a@mkt',
        '    Version: 1.0.0',
        '    Status: ✔ enabled',
        '',
        'project',
        '  ❯ b@mkt',
        '    Version: 1.0.0',
        '    Status: ✔ enabled',
      ]);
    });

    it('emits each scope header once even when the input interleaves scopes', () => {
      const lines = formatPluginList([
        makePlugin({ id: 'a@mkt', scope: 'user' }),
        makePlugin({ id: 'b@mkt', scope: 'project' }),
        makePlugin({ id: 'c@mkt', scope: 'user' }),
      ]);
      expect(lines.filter((l) => l === 'user')).toHaveLength(1);
      const idLines = lines.filter((l) => l.trim().startsWith('❯'));
      expect(idLines).toEqual(['  ❯ a@mkt', '  ❯ c@mkt', '  ❯ b@mkt']);
    });

    it('does not print a header for a scope with no plugins', () => {
      const userPlugin = makePlugin({ id: 'a@mkt', scope: 'user' });
      const localPlugin = makePlugin({ id: 'b@mkt', scope: 'local' });
      const lines = formatPluginList([userPlugin, localPlugin]);
      expect(lines).not.toContain('project');
    });
  });

  describe('sort order', () => {
    it('preserves user → project → local scope ordering and id-ascending within scope', () => {
      const plugins = [
        makePlugin({ id: 'z@mkt', scope: 'user' }),
        makePlugin({ id: 'a@mkt', scope: 'local' }),
        makePlugin({ id: 'm@mkt', scope: 'project' }),
        makePlugin({ id: 'a@mkt', scope: 'user' }),
      ];
      // Sort as DefaultPluginRegistry would, then format
      const sorted = [...plugins].sort((a, b) => {
        const order = ['user', 'project', 'local'] as const;
        const scopeDiff = order.indexOf(a.scope) - order.indexOf(b.scope);
        if (scopeDiff !== 0) return scopeDiff;
        return a.id.localeCompare(b.id);
      });
      const lines = formatPluginList(sorted);
      const idLines = lines.filter((l) => l.trim().startsWith('❯'));
      expect(idLines).toEqual([
        '  ❯ a@mkt', // user, a
        '  ❯ z@mkt', // user, z
        '  ❯ m@mkt', // project, m
        '  ❯ a@mkt', // local, a
      ]);
    });
  });
});
