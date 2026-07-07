import { DefaultRepositoryProvider } from './repository_provider';
import { RepositoryController } from './repository_controller';
import { DefaultSelectedProjectStore } from './project_store';
import { PersistedProjectController } from './project_controller';

export const repositoryProviderContributions = [
  DefaultRepositoryProvider,
  RepositoryController,
  PersistedProjectController,
  DefaultSelectedProjectStore,
];
