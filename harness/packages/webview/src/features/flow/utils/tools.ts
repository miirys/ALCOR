import { FolderTree, GitBranch, Gitlab, FlaskConical, Wrench } from 'lucide-vue-next';
import type { FunctionalComponent } from 'vue';

export {
  groupToolsByCategory,
  groupToolsByTopCategory,
  type ToolCategoryGroup,
  type TopLevelToolCategory,
} from '@gitlab-org/flow-builder/flow';

export interface CategoryIcon {
  icon: FunctionalComponent;
  color: string;
}

export const CATEGORY_ICONS: Record<string, CategoryIcon> = {
  'File System': { icon: FolderTree, color: 'text-blue-500' },
  Git: { icon: GitBranch, color: 'text-orange-500' },
  GitLab: { icon: Gitlab, color: 'text-orange-500' },
  Testing: { icon: FlaskConical, color: 'text-emerald-500' },
};

const CATEGORY_FALLBACK_ICON: CategoryIcon = {
  icon: Wrench,
  color: 'text-muted-foreground',
};

export function resolveCategoryIcon(topLabel: string): CategoryIcon {
  return CATEGORY_ICONS[topLabel] ?? CATEGORY_FALLBACK_ICON;
}
