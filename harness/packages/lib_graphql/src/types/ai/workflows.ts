import { PaginationInfo } from '..';

export type DuoWorkflowEdge = {
  node: DuoWorkflowInfo;
};

export type DuoMessage = {
  content: string;
  messageType: string;
  toolInfo: string | null;
};

export type DuoWorkflowConnection = {
  edges: DuoWorkflowEdge[] | null;
  pageInfo: PaginationInfo;
};

export type DuoWorkflowEvent = {
  duoMessages: DuoMessage[];
};

export type Project = {
  id: string;
  fullPath: string;
};

export type DuoWorkflowInfo = {
  id: string;
  workflowDefinition: string | null;
  aiCatalogItemVersionId: string | null;
  project: Project | null;
  humanStatus: string;
  updatedAt: string;
  goal: string | null;
  latestCheckpoint: DuoWorkflowEvent | null;
  archived: boolean | null;
};
