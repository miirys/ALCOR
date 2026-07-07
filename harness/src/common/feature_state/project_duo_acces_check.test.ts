import { Disposable } from '@gitlab-org/disposable';
import { TextDocumentChangeEvent } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DUO_DISABLED_FOR_PROJECT } from '@gitlab-org/core';
import { DefaultConfigService } from '@gitlab-org/config';
import { DocumentService, TextDocumentChangeListener } from '../document_service';
import { TextDocumentChangeListenerType } from '../text_document_change_listener_type';
import { DuoWorkspaceProjectAccessCache, DuoProjectAccessChecker } from '../services/duo_access';
import { DuoProjectStatus } from '../services/duo_access/project_access_checker';
import { DuoProject } from '../services/duo_access/workspace_project_access_cache';
import { DefaultProjectDuoAccessCheck, ProjectDuoAccessCheck } from './project_duo_acces_check';

describe('ProjectDuoAccessCheck', () => {
  const disposables: Disposable[] = [];
  let check: ProjectDuoAccessCheck;
  const onDocumentChange = jest.fn();
  const onDuoProjectCacheUpdate = jest.fn();
  let documentEventListener: TextDocumentChangeListener;
  let duoProjectCacheUpdateListener: () => void;
  const policyEngagedChangeListener = jest.fn();

  const uri = 'file:///path/to/workspace/file.txt';
  const workspaceFolder: WorkspaceFolder = createFakePartial<WorkspaceFolder>({
    uri: 'file:///path/to/workspace',
  });

  const documentService = createFakePartial<DocumentService>({
    onDocumentChange,
  });
  const configService = new DefaultConfigService();

  const duoProjectAccessChecker = createFakePartial<DuoProjectAccessChecker>({
    checkProjectStatus: jest.fn(),
  });
  const duoProjectAccessCache = createFakePartial<DuoWorkspaceProjectAccessCache>({
    onDuoProjectCacheUpdate,
  });

  function triggerDocumentEvent(documentUri: string) {
    const document = createFakePartial<TextDocument>({ uri: documentUri });
    const event = createFakePartial<TextDocumentChangeEvent<TextDocument>>({ document });
    documentEventListener(event, TextDocumentChangeListenerType.onDidSetActive);
  }

  beforeEach(async () => {
    onDocumentChange.mockImplementation((_listener) => {
      documentEventListener = _listener;
    });

    onDuoProjectCacheUpdate.mockImplementation((_listener) => {
      duoProjectCacheUpdateListener = _listener;
    });

    check = new DefaultProjectDuoAccessCheck(
      documentService,
      configService,
      duoProjectAccessChecker,
      duoProjectAccessCache,
    );

    await check?.init?.();

    disposables.push(check.onChanged(policyEngagedChangeListener));
  });

  afterEach(() => {
    while (disposables.length > 0) {
      disposables.pop()!.dispose();
    }
  });

  describe('is updated on config change"', () => {
    it('should NOT be engaged by default', () => {
      expect(check.engaged).toBe(false);
    });

    it('should NOT be engaged when enabled in setting and there is no active document', () => {
      configService.set('duo.enabledWithoutGitlabProject', true);
      expect(check.engaged).toBe(false);
    });

    it('should be engaged when disabled in setting and there is no active document', () => {
      configService.set('duo.enabledWithoutGitlabProject', false);
      expect(check.engaged).toBe(true);
    });
  });

  describe('is updated on document set active in editor event', () => {
    beforeEach(() => {
      configService.set('workspaceFolders', [workspaceFolder]);
    });

    it('should NOT be engaged when duo enabled for project file', async () => {
      jest
        .mocked(duoProjectAccessChecker.checkProjectStatus)
        .mockReturnValueOnce({ status: DuoProjectStatus.DuoEnabled, project: undefined });
      triggerDocumentEvent(uri);
      await new Promise(process.nextTick);
      expect(check.engaged).toBe(false);
    });

    it('should be engaged when duo disabled for project file', async () => {
      jest
        .mocked(duoProjectAccessChecker.checkProjectStatus)
        .mockReturnValueOnce({ status: DuoProjectStatus.DuoDisabled, project: undefined });

      triggerDocumentEvent(uri);
      await new Promise(process.nextTick);

      expect(check.engaged).toBe(true);
    });

    it('should use default setting when no GitLab project detected', async () => {
      configService.set('duo.enabledWithoutGitlabProject', true);
      jest
        .mocked(duoProjectAccessChecker.checkProjectStatus)
        .mockReturnValueOnce({ status: DuoProjectStatus.NonGitlabProject, project: undefined });

      triggerDocumentEvent(uri);
      await new Promise(process.nextTick);

      expect(check.engaged).toBe(false);
    });
  });

  describe('is updated on duo cache update', () => {
    beforeEach(() => {
      configService.set('workspaceFolders', [workspaceFolder]);
      configService.set('duo.enabledWithoutGitlabProject', false);
    });

    it('should be engaged and rely on setting value when file does not belong to Duo project', async () => {
      jest
        .mocked(duoProjectAccessChecker.checkProjectStatus)
        .mockReturnValueOnce({ status: DuoProjectStatus.DuoEnabled, project: undefined });
      triggerDocumentEvent(uri);
      await new Promise(process.nextTick);
      expect(check.engaged).toBe(false);
      jest
        .mocked(duoProjectAccessChecker.checkProjectStatus)
        .mockReturnValueOnce({ status: DuoProjectStatus.NonGitlabProject, project: undefined });
      duoProjectCacheUpdateListener();
      expect(check.engaged).toBe(true);
    });
  });

  describe('change event', () => {
    it('emits after check is updated', () => {
      policyEngagedChangeListener.mockClear();

      configService.set('duo.enabledWithoutGitlabProject', true);

      expect(policyEngagedChangeListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('validate', () => {
    it('should be valid if duo is enabled without GitLab project', async () => {
      const result = await check.validate({ duo: { enabledWithoutGitlabProject: true } });

      expect(result).toEqual({
        checkId: expect.any(String),
        details: expect.any(String),
        engaged: false,
      });
    });

    it('should be valid if no workspace folders are specified', async () => {
      const result = await check.validate({ workspaceFolders: [] });

      expect(result).toEqual({
        checkId: expect.any(String),
        details: expect.any(String),
        engaged: false,
      });
    });

    it('should be invalid if one or more project has duo disabled', async () => {
      jest
        .mocked(duoProjectAccessChecker.checkProjectStatus)
        .mockReturnValueOnce({
          status: DuoProjectStatus.DuoDisabled,
          project: createFakePartial<DuoProject>({ projectPath: 'org/project1' }),
        })
        .mockReturnValueOnce({
          status: DuoProjectStatus.DuoEnabled,
          project: createFakePartial<DuoProject>({ projectPath: 'org/project2' }),
        });

      const result = await check.validate({
        workspaceFolders: [
          { uri: 'file:///path/to/project1', name: 'project1' },
          { uri: 'file:///path/to/project2', name: 'project2' },
        ],
      });

      expect(result?.checkId).toBe(DUO_DISABLED_FOR_PROJECT);
      expect(result?.details).toContain('project1');
    });

    it('should be valid if all projects have duo enabled', async () => {
      jest.mocked(duoProjectAccessChecker.checkProjectStatus).mockReturnValueOnce({
        status: DuoProjectStatus.DuoEnabled,
        project: createFakePartial<DuoProject>({ projectPath: 'org/project1' }),
      });

      const result = await check.validate({
        workspaceFolders: [{ uri: 'file:///path/to/project1', name: 'project1' }],
      });

      expect(result).toEqual({
        checkId: expect.any(String),
        details: expect.any(String),
        engaged: false,
      });
    });
  });
});
