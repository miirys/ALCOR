import { createInterfaceId } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { EventListener } from '../event_emitter';
import { Notifier } from '../notifier';
import { GetRepositoriesResponse } from './index';

export interface RepositoryProvider extends Disposable, Notifier<GetRepositoriesResponse> {
  getRepositories(): GetRepositoriesResponse;

  onRepositoriesChange(listener: EventListener<GetRepositoriesResponse>): Disposable;
}

export const RepositoryProvider = createInterfaceId<RepositoryProvider>('RepositoryProvider');
