import { WorkspaceFolder } from 'vscode-languageserver';
import { TestLogger } from '@gitlab-org/logging';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import {
  DefaultDidChangeWorkspaceFoldersHandler,
  DidChangeWorkspaceFoldersHandler,
} from './did_change_workspace_folders_handler';

describe('DidChangeWorkspaceFoldersHandler', () => {
  const wf1: WorkspaceFolder = { uri: '//Users/workspace/1', name: 'workspace1' };
  const wf2: WorkspaceFolder = { uri: '//Users/workspace/2', name: 'workspace2' };
  const wf3: WorkspaceFolder = { uri: '//Users/workspace/3', name: 'workspace3' };

  let configService: ConfigService;
  let handler: DidChangeWorkspaceFoldersHandler;

  beforeEach(() => {
    configService = new DefaultConfigService();

    handler = new DefaultDidChangeWorkspaceFoldersHandler(configService, new TestLogger());

    jest.spyOn(configService, 'set');
  });

  it('stores `workspaceFolders` in configService', async () => {
    await handler.notificationHandler({ event: { added: [wf1, wf2], removed: [] } });

    expect(configService.get('workspaceFolders')).toHaveLength(2);
    expect(configService.get('workspaceFolders')).toEqual([wf1, wf2]);

    await handler.notificationHandler({ event: { added: [wf3], removed: [wf2] } });

    expect(configService.get('workspaceFolders')).toHaveLength(2);
    expect(configService.get('workspaceFolders')).toEqual([wf1, wf3]);
  });
});
