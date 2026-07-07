import { AiCatalogItemID, PaginationInfo, ProjectID } from '..';

export type AiCatalogProject = {
  id: ProjectID;
  fullPath: string;
};

export type AiCatalogFlowVersion = {
  id: string;
  versionName: string | null;
  humanVersionName: string | null;
  released: boolean;
  releasedAt: string | null;
  updatedAt: string;
  definition: string | null;
};

export type AiCatalogFlowItem = {
  id: AiCatalogItemID;
  name: string;
  description: string;
  public: boolean;
  updatedAt: string;
  project: AiCatalogProject | null;
  latestVersion: AiCatalogFlowVersion | null;
};

export type AiCatalogFlowEdge = {
  node: AiCatalogFlowItem;
};

export type AiCatalogFlowConnection = {
  edges: AiCatalogFlowEdge[] | null;
  pageInfo: PaginationInfo;
};
