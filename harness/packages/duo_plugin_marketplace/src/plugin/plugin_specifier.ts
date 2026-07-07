import { assertPathSegment } from './path_segment';

/** A parsed `<plugin>@<marketplace>` specifier. */
export interface PluginSpecifier {
  plugin: string;
  marketplace: string;
}

/**
 * Parse a `<plugin>@<marketplace>` specifier (split on the last `@`). Both
 * parts are validated as safe path segments.
 */
export function parseSpecifier(raw: string): PluginSpecifier {
  const at = raw.lastIndexOf('@');
  if (at <= 0 || at === raw.length - 1) {
    throw new Error(
      `Invalid plugin specifier ${JSON.stringify(raw)}: expected "<plugin>@<marketplace>"`,
    );
  }
  const plugin = raw.slice(0, at);
  const marketplace = raw.slice(at + 1);
  assertPathSegment(plugin, 'plugin name');
  assertPathSegment(marketplace, 'marketplace name');
  return { plugin, marketplace };
}
