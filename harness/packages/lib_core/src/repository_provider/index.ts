import { declareRequest } from '@gitlab-org/rpc';
import { z } from 'zod';
import { NotificationType } from 'vscode-languageserver-protocol';

export * from './repository_provider';

export const RepositoryEndpoints: {
  // client => LS
  readonly GET_REPOSITORIES: '$/gitlab/getRepositories';
  readonly SELECT_PROJECT: '$/gitlab/selectProject';
  readonly CLEAR_PROJECT: '$/gitlab/clearProject';
  // LS => client
  readonly REPOSITORIES_CHANGED: '$/gitlab/repositoriesChanged';
} = {
  GET_REPOSITORIES: '$/gitlab/getRepositories',
  SELECT_PROJECT: '$/gitlab/selectProject',
  CLEAR_PROJECT: '$/gitlab/clearProject',
  REPOSITORIES_CHANGED: '$/gitlab/repositoriesChanged',
};

const RemoteUrlSchema = z.object({
  url: z.string(),
  // TODO: we do not parse fetch and push urls from git config, only url
  type: z.enum(['fetch', 'push', 'both']),
});

const RemoteSchema = z.object({
  name: z.string(),
  urls: z.array(RemoteUrlSchema),
});

const RepositorySchema = z.object({
  rootFsPath: z.string(),
  folderName: z.string(),
  remotes: z.array(RemoteSchema),
});

export const GitRemoteUrlPointerSchema = z.object({
  urlEntry: RemoteUrlSchema,
  remote: RemoteSchema,
  repository: RepositorySchema,
});

const ProjectInRepositorySchema = z.object({
  project: z.object({
    name: z.string(),
    namespaceWithPath: z.string(),
    webUrl: z.string(),
  }),
  account: z.object({
    id: z.string(),
    username: z.string(),
    restId: z.number(),
    instanceUrl: z.string(),
  }),
  pointer: GitRemoteUrlPointerSchema,
  initializationType: z.enum(['detected', 'selected']),
});

const RepositoryWithoutProjectSchema = z.object({
  type: z.literal('none'),
  repository: RepositorySchema,
});

const SingleProjectRepositorySchema = z.object({
  type: z.literal('single'),
  repository: RepositorySchema,
  projects: z.array(ProjectInRepositorySchema),
  selectedProject: ProjectInRepositorySchema,
});

const MultipleProjectRepositorySchema = z.object({
  type: z.literal('multiple'),
  repository: RepositorySchema,
  projects: z.array(ProjectInRepositorySchema),
});

const SelectedProjectRepositorySchema = z.object({
  type: z.literal('selected'),
  repository: RepositorySchema,
  projects: z.array(ProjectInRepositorySchema),
  selectedProject: ProjectInRepositorySchema,
});

const RepositoryStateSchema = z.union([
  RepositoryWithoutProjectSchema,
  SingleProjectRepositorySchema,
  MultipleProjectRepositorySchema,
  SelectedProjectRepositorySchema,
]);

const GetRepositoriesResponseSchema = z.object({
  repositories: z.array(RepositoryStateSchema),
});

export const GetRepositoriesRequest = declareRequest(RepositoryEndpoints.GET_REPOSITORIES)
  .withResponse(GetRepositoriesResponseSchema)
  .build();

const SelectProjectRequestSchema = ProjectInRepositorySchema;

const ClearProjectRequestSchema = z.object({
  rootFsPath: z.string(),
});

export const SelectProjectRequest = declareRequest(RepositoryEndpoints.SELECT_PROJECT)
  .withParams(SelectProjectRequestSchema)
  .build();

export const ClearProjectRequest = declareRequest(RepositoryEndpoints.CLEAR_PROJECT)
  .withParams(ClearProjectRequestSchema)
  .build();

// Infer TypeScript types from schemas
export type RemoteUrl = z.infer<typeof RemoteUrlSchema>;
export type Remote = z.infer<typeof RemoteSchema>;
export type ProjectInRepository = z.infer<typeof ProjectInRepositorySchema>;
export type Repository = z.infer<typeof RepositorySchema>;
export type RepositoryWithoutProject = z.infer<typeof RepositoryWithoutProjectSchema>;
export type SingleProjectRepository = z.infer<typeof SingleProjectRepositorySchema>;
export type MultipleProjectRepository = z.infer<typeof MultipleProjectRepositorySchema>;
export type SelectedProjectRepository = z.infer<typeof SelectedProjectRepositorySchema>;
export type RepositoryState = z.infer<typeof RepositoryStateSchema>;
export type GetRepositoriesResponse = z.infer<typeof GetRepositoriesResponseSchema>;
export type SelectProjectParams = z.infer<typeof SelectProjectRequestSchema>;
export type ClearProjectParams = z.infer<typeof ClearProjectRequestSchema>;
export type GitRemoteUrlPointer = z.infer<typeof GitRemoteUrlPointerSchema>;

export const RepositoriesChangedNotificationType = new NotificationType<GetRepositoriesResponse>(
  RepositoryEndpoints.REPOSITORIES_CHANGED,
);
