import type {
  AIContextItem,
  GitContextItem,
  DependencyAIContextItem,
  ImportAIContextItem,
  OpenTabAIContextItem,
  IssueAIContextItem,
  MergeRequestAIContextItem,
  LocalFileAIContextItem,
} from '@gitlab-org/ai-context';

export type AIContextItemByProviderType = {
  open_tab: OpenTabAIContextItem;
  import: ImportAIContextItem;
  local_file_search: LocalFileAIContextItem;
  issue: IssueAIContextItem;
  merge_request: MergeRequestAIContextItem;
  dependency: DependencyAIContextItem;
  local_git: GitContextItem;
};

export function asTypedContextItem<T extends keyof AIContextItemByProviderType>(
  item: AIContextItem,
  type: T,
): item is AIContextItemByProviderType[T] {
  return item.metadata.subType === type;
}
