import type { ListedPlugin, PluginScope } from '@gitlab-org/duo-plugin-marketplace/node';
import { bold } from '../../utils/console_style';

function scopeHeader(scope: PluginScope): string {
  return bold(scope);
}

function formatPlugin(plugin: ListedPlugin): string[] {
  const statusGlyph = plugin.enabled ? '✔' : '✘';
  const statusLabel = plugin.enabled ? 'enabled' : 'disabled';
  return [
    `  ❯ ${plugin.id}`,
    `    Version: ${plugin.version}`,
    `    Status: ${statusGlyph} ${statusLabel}`,
  ];
}

export function formatPluginList(plugins: ListedPlugin[]): string[] {
  if (plugins.length === 0) {
    return ['No plugins installed. Use `duo plugin install` to install a plugin.'];
  }

  // Group by scope (insertion-ordered), so scope display order follows the
  // input's first occurrence of each scope but a scope header is never
  // repeated, whatever order the input arrives in.
  const groups = new Map<PluginScope, ListedPlugin[]>();
  for (const plugin of plugins) {
    const group = groups.get(plugin.scope) ?? [];
    group.push(plugin);
    groups.set(plugin.scope, group);
  }

  const lines: string[] = ['Installed plugins:', ''];

  let first = true;
  for (const [scope, group] of groups) {
    if (!first) {
      lines.push('');
    }
    first = false;
    lines.push(scopeHeader(scope));
    for (const plugin of group) {
      lines.push(...formatPlugin(plugin));
    }
  }

  return lines;
}
