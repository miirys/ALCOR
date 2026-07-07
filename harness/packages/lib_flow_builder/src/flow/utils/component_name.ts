/**
 * Derive a persistence-safe component name from a user-facing display label.
 *
 * Component names must match `^[a-zA-Z0-9_]+$`. This function:
 * - Lowercases the input
 * - Replaces whitespace runs with a single underscore
 * - Strips all characters not in [a-z0-9_]
 * - Collapses consecutive underscores
 * - Trims leading/trailing underscores
 *
 * @example
 *   toComponentName('Code Analyzer')  // 'code_analyzer'
 *   toComponentName('step_one')       // 'step_one'
 *   toComponentName('My Node (v2)')   // 'my_node_v2'
 */
export function toComponentName(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Convert a persistence component name to a user-friendly display label.
 *
 * Replaces underscores with spaces and title-cases each word.
 *
 * @example
 *   fromComponentName('code_analyzer')  // 'Code Analyzer'
 *   fromComponentName('step_one')       // 'Step One'
 *   fromComponentName('analyzer')       // 'Analyzer'
 */
export function fromComponentName(name: string): string {
  return name
    .toLowerCase()
    .split('_')
    .filter((w) => w.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
