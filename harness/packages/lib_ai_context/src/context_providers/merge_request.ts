import type { GitLabGID } from '@gitlab-org/core';
import type { AIContextItem, AIContextItemMetadata } from '../ai_context_item';

export type MergeRequestMetadata = AIContextItemMetadata & {
  icon: 'merge-request';
  subTypeLabel: 'Merge request';
  webUrl: string;
};

export interface MergeRequestAIContextItem extends AIContextItem {
  id: GitLabGID;
  category: 'merge_request';
  metadata: MergeRequestMetadata;
}
