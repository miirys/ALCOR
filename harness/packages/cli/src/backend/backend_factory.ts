import { createInterfaceId } from '@gitlab/needle';
import { CliBackend } from './backend';

export interface BackendFactory {
  create(): CliBackend;
}

export const BackendFactory = createInterfaceId<BackendFactory>('BackendFactory');
