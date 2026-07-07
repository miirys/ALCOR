import {
  FileText,
  Folder,
  GitBranch,
  GitPullRequest,
  Package,
  FolderGit2,
  Book,
} from 'lucide-vue-next';
import type { AIContextCategory } from '@gitlab-org/lib-duo-agent-platform/webview';

const CATEGORY_ICONS: Record<string, typeof FileText> = {
  file: FileText,
  directory: Folder,
  local_git: GitBranch,
  issue: Book,
  merge_request: GitPullRequest,
  dependency: Package,
  repository: FolderGit2,
};

export function getCategoryIcon(category: AIContextCategory | string) {
  return CATEGORY_ICONS[category] ?? FileText;
}
