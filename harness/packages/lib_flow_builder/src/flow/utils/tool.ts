import type { ToolDefinition } from '../registry';

const DEFAULT_CATEGORY = 'Other';
const CATEGORY_DELIMITER = '::';
const SUBCATEGORY_SEPARATOR = ' › ';

export interface ToolCategoryGroup {
  /** Raw category string (e.g. `"GitLab::Merge Requests"`). */
  key: string;
  /** First `::`-delimited segment. */
  topLabel: string;
  /** Remaining segments joined by ` › `, or empty when there is no subcategory. */
  subLabel: string;
  tools: ToolDefinition[];
}

export interface TopLevelToolCategory {
  key: string;
  label: string;
  count: number;
  subcategories: { key: string; label: string; tools: ToolDefinition[] }[];
}

/**
 * Group tools by their raw `category` string, splitting on `::` into a
 * top-level label and an optional subcategory label. Icon resolution is
 * the caller's job — this utility stays UI-free.
 */
export function groupToolsByCategory(tools: ToolDefinition[]): ToolCategoryGroup[] {
  const buckets = new Map<string, ToolDefinition[]>();
  for (const tool of tools) {
    const cat = tool.category || DEFAULT_CATEGORY;
    const bucket = buckets.get(cat);
    if (bucket) {
      bucket.push(tool);
    } else {
      buckets.set(cat, [tool]);
    }
  }

  return Array.from(buckets.entries()).map(([rawCategory, catTools]) => {
    const parts = rawCategory.split(CATEGORY_DELIMITER).map((s) => s.trim());
    const topLabel = parts[0] || DEFAULT_CATEGORY;
    const subLabel = parts.length > 1 ? parts.slice(1).join(SUBCATEGORY_SEPARATOR) : '';
    return {
      key: rawCategory,
      topLabel,
      subLabel,
      tools: catTools,
    };
  });
}

/**
 * Group tools by their top-level category (the portion before `::`),
 * nesting subcategories underneath.
 */
export function groupToolsByTopCategory(tools: ToolDefinition[]): TopLevelToolCategory[] {
  const grouped = groupToolsByCategory(tools);
  const topMap = new Map<string, TopLevelToolCategory>();

  for (const entry of grouped) {
    let group = topMap.get(entry.topLabel);
    if (!group) {
      group = {
        key: entry.topLabel,
        label: entry.topLabel,
        count: 0,
        subcategories: [],
      };
      topMap.set(entry.topLabel, group);
    }
    group.subcategories.push({
      key: entry.key,
      label: entry.subLabel,
      tools: entry.tools,
    });
    group.count += entry.tools.length;
  }

  return Array.from(topMap.values());
}
