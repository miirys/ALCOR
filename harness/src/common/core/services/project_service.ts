import { createInterfaceId } from '@gitlab/needle';
import { URI } from 'vscode-languageserver-protocol';

export interface Project {
  id: number;
  uri: string;
  namespaceWithPath: string;
}

export interface ProjectService {
  getProjectByFileURI(uri: URI): Promise<Project | undefined>;
}

export const ProjectService = createInterfaceId<ProjectService>('ProjectService');
