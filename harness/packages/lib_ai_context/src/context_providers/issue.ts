import type { GitLabGID } from '@gitlab-org/core';
import type { AIContextItem, AIContextItemMetadata } from '../ai_context_item';

export type IssueMetadata = AIContextItemMetadata & {
  icon: 'issues';
  subTypeLabel: 'Issue';
  webUrl: string;
};

export interface IssueAIContextItem extends AIContextItem {
  id: GitLabGID;
  category: 'issue';
  metadata: IssueMetadata;
}
