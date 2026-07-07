import { TextDocument } from 'vscode-languageserver-textdocument';
import { WorkspaceFolder } from 'vscode-languageserver';
import { createFakePartial } from '@gitlab-org/test-utils';
import { SUGGESTIONS_FILE_EXCLUDED } from '@gitlab-org/core';
import { TestLogger } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { DocumentService } from '../document_service';
import { TextDocumentChangeListenerType } from '../text_document_change_listener_type';
import {
  DuoExclusionChecker,
  ExclusionCheckResult,
  DuoProjectAccessChecker,
  DuoProjectStatus,
} from '../services/duo_access';
import { DuoProject } from '../services/duo_access/workspace_project_access_cache';
import { DefaultCodeSuggestionsFileExclusionCheck } from './file_exclusion_check';

describe('DefaultCodeSuggestionsFileExclusionCheck', () => {
  let documentService: DocumentService;
  let duoExclusionChecker: DuoExclusionChecker;
  let duoProjectAccessChecker: DuoProjectAccessChecker;
  let configService: ConfigService;
  let fileExclusionCheck: DefaultCodeSuggestionsFileExclusionCheck;
  let mockDocument: TextDocument;
  let mockWorkspaceFolder: WorkspaceFolder;
  let mockProject: DuoProject;

  beforeEach(() => {
    documentService = createFakePartial<DocumentService>({
      onDocumentChange: jest.fn(),
    });

    duoExclusionChecker = createFakePartial<DuoExclusionChecker>({
      checkFileExclusion: jest.fn(),
    });

    duoProjectAccessChecker = createFakePartial<DuoProjectAccessChecker>({
      checkProjectStatus: jest.fn(),
    });

    configService = createFakePartial<ConfigService>({
      get: jest.fn(),
      onConfigChange: jest.fn(),
    });

    mockDocument = createFakePartial<TextDocument>({
      uri: 'file:///workspace/src/test.js',
      languageId: 'javascript',
    });

    mockWorkspaceFolder = {
      uri: 'file:///workspace',
      name: 'test-workspace',
    };

    mockProject = createFakePartial<DuoProject>({
      namespaceWithPath: 'test/project',
      exclusionRules: ['*.log', 'node_modules/**'],
    });

    fileExclusionCheck = new DefaultCodeSuggestionsFileExclusionCheck(
      documentService,
      duoExclusionChecker,
      duoProjectAccessChecker,
      configService,
      new TestLogger(),
    );
  });

  describe('initialization', () => {
    it('should register document change listener', () => {
      expect(documentService.onDocumentChange).toHaveBeenCalled();
    });

    it('should have correct id', () => {
      expect(fileExclusionCheck.id).toBe(SUGGESTIONS_FILE_EXCLUDED);
    });

    it('should have correct details', () => {
      expect(fileExclusionCheck.details).toBe('File is excluded by project exclusion rules');
    });

    it('should not be engaged initially', () => {
      expect(fileExclusionCheck.engaged).toBe(false);
    });
  });

  describe('document change handling', () => {
    let documentChangeCallback: (
      event: { document: TextDocument },
      handlerType: TextDocumentChangeListenerType,
    ) => void;

    beforeEach(() => {
      const onDocumentChangeMock = jest.mocked(documentService.onDocumentChange);
      [[documentChangeCallback]] = onDocumentChangeMock.mock.calls;
    });

    describe.each([
      ['onDidSetActive', TextDocumentChangeListenerType.onDidSetActive],
      ['onDidOpen', TextDocumentChangeListenerType.onDidOpen],
    ])('when document event is %s', (_eventName, eventType) => {
      it('should update and check file exclusion', () => {
        (jest.mocked(configService.get) as jest.Mock).mockReturnValue([mockWorkspaceFolder]);
        jest.mocked(duoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          project: mockProject,
          status: DuoProjectStatus.DuoEnabled,
        });

        const exclusionResult: ExclusionCheckResult = {
          isExcluded: false,
          project: mockProject,
        };
        jest.mocked(duoExclusionChecker.checkFileExclusion).mockReturnValue(exclusionResult);

        documentChangeCallback({ document: mockDocument }, eventType);

        expect(duoExclusionChecker.checkFileExclusion).toHaveBeenCalledWith(
          'src/test.js',
          mockProject,
        );
        expect(fileExclusionCheck.engaged).toBe(false);
      });
    });

    it('should not update for other document change types', () => {
      documentChangeCallback(
        { document: mockDocument },
        TextDocumentChangeListenerType.onDidChangeContent,
      );

      expect(duoExclusionChecker.checkFileExclusion).not.toHaveBeenCalled();
    });
  });

  describe('file exclusion checking', () => {
    let documentChangeCallback: (
      event: { document: TextDocument },
      handlerType: TextDocumentChangeListenerType,
    ) => void;

    beforeEach(() => {
      const onDocumentChangeMock = jest.mocked(documentService.onDocumentChange);
      [[documentChangeCallback]] = onDocumentChangeMock.mock.calls;
    });

    describe.each([
      ['onDidSetActive', TextDocumentChangeListenerType.onDidSetActive],
      ['onDidOpen', TextDocumentChangeListenerType.onDidOpen],
    ])('when document event is %s', (_eventName, eventType) => {
      it('should be engaged when file is excluded', () => {
        (jest.mocked(configService.get) as jest.Mock).mockReturnValue([mockWorkspaceFolder]);
        jest.mocked(duoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          project: mockProject,
          status: DuoProjectStatus.DuoEnabled,
        });

        const exclusionResult: ExclusionCheckResult = {
          isExcluded: true,
          project: mockProject,
        };
        jest.mocked(duoExclusionChecker.checkFileExclusion).mockReturnValue(exclusionResult);

        documentChangeCallback({ document: mockDocument }, eventType);

        expect(fileExclusionCheck.engaged).toBe(true);
      });

      it('should not be engaged when file is not excluded', () => {
        (jest.mocked(configService.get) as jest.Mock).mockReturnValue([mockWorkspaceFolder]);
        jest.mocked(duoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          project: mockProject,
          status: DuoProjectStatus.DuoEnabled,
        });

        const exclusionResult: ExclusionCheckResult = {
          isExcluded: false,
          project: mockProject,
        };
        jest.mocked(duoExclusionChecker.checkFileExclusion).mockReturnValue(exclusionResult);

        documentChangeCallback({ document: mockDocument }, eventType);

        expect(fileExclusionCheck.engaged).toBe(false);
      });
    });

    it('should not be engaged when no workspace folder is found', () => {
      (jest.mocked(configService.get) as jest.Mock).mockReturnValue([]);

      documentChangeCallback(
        { document: mockDocument },
        TextDocumentChangeListenerType.onDidSetActive,
      );

      expect(duoExclusionChecker.checkFileExclusion).not.toHaveBeenCalled();
      expect(fileExclusionCheck.engaged).toBe(false);
    });

    it('should not be engaged when no project is found', () => {
      (jest.mocked(configService.get) as jest.Mock).mockReturnValue([mockWorkspaceFolder]);
      jest.mocked(duoProjectAccessChecker.checkProjectStatus).mockReturnValue({
        project: undefined,
        status: DuoProjectStatus.DuoDisabled,
      });

      documentChangeCallback(
        { document: mockDocument },
        TextDocumentChangeListenerType.onDidSetActive,
      );

      expect(duoExclusionChecker.checkFileExclusion).not.toHaveBeenCalled();
      expect(fileExclusionCheck.engaged).toBe(false);
    });

    it('should handle errors gracefully', () => {
      (jest.mocked(configService.get) as jest.Mock).mockReturnValue([mockWorkspaceFolder]);
      jest.mocked(duoProjectAccessChecker.checkProjectStatus).mockImplementation(() => {
        throw new Error('Test error');
      });

      documentChangeCallback(
        { document: mockDocument },
        TextDocumentChangeListenerType.onDidSetActive,
      );

      expect(fileExclusionCheck.engaged).toBe(false);
    });
  });

  describe('relative path calculation', () => {
    let documentChangeCallback: (
      event: { document: TextDocument },
      handlerType: TextDocumentChangeListenerType,
    ) => void;

    beforeEach(() => {
      const onDocumentChangeMock = jest.mocked(documentService.onDocumentChange);
      [[documentChangeCallback]] = onDocumentChangeMock.mock.calls;
    });

    describe.each([
      ['onDidSetActive', TextDocumentChangeListenerType.onDidSetActive],
      ['onDidOpen', TextDocumentChangeListenerType.onDidOpen],
    ])('when document event is %s', (_eventName, eventType) => {
      it('should calculate correct relative path', () => {
        const document = createFakePartial<TextDocument>({
          uri: 'file:///workspace/src/components/Button.tsx',
          languageId: 'typescript',
        });

        (jest.mocked(configService.get) as jest.Mock).mockReturnValue([mockWorkspaceFolder]);
        jest.mocked(duoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          project: mockProject,
          status: DuoProjectStatus.DuoEnabled,
        });

        const exclusionResult: ExclusionCheckResult = {
          isExcluded: false,
          project: mockProject,
        };
        jest.mocked(duoExclusionChecker.checkFileExclusion).mockReturnValue(exclusionResult);

        documentChangeCallback({ document }, eventType);

        expect(duoExclusionChecker.checkFileExclusion).toHaveBeenCalledWith(
          'src/components/Button.tsx',
          mockProject,
        );
      });

      it('should handle file URI without leading slash', () => {
        const document = createFakePartial<TextDocument>({
          uri: 'file:///workspace/README.md',
          languageId: 'markdown',
        });

        (jest.mocked(configService.get) as jest.Mock).mockReturnValue([mockWorkspaceFolder]);
        jest.mocked(duoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          project: mockProject,
          status: DuoProjectStatus.DuoEnabled,
        });

        const exclusionResult: ExclusionCheckResult = {
          isExcluded: false,
          project: mockProject,
        };
        jest.mocked(duoExclusionChecker.checkFileExclusion).mockReturnValue(exclusionResult);

        documentChangeCallback({ document }, eventType);

        expect(duoExclusionChecker.checkFileExclusion).toHaveBeenCalledWith(
          'README.md',
          mockProject,
        );
      });
    });
  });

  describe('event handling', () => {
    describe.each([
      ['onDidSetActive', TextDocumentChangeListenerType.onDidSetActive],
      ['onDidOpen', TextDocumentChangeListenerType.onDidOpen],
    ])('when document event is %s', (_eventName, eventType) => {
      it('should emit change events', () => {
        const changeListener = jest.fn();
        fileExclusionCheck.onChanged(changeListener);

        const onDocumentChangeMock = jest.mocked(documentService.onDocumentChange);
        const [[documentChangeCallback]] = onDocumentChangeMock.mock.calls;

        (jest.mocked(configService.get) as jest.Mock).mockReturnValue([mockWorkspaceFolder]);
        jest.mocked(duoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          project: mockProject,
          status: DuoProjectStatus.DuoEnabled,
        });

        const exclusionResult: ExclusionCheckResult = {
          isExcluded: true,
          project: mockProject,
        };
        jest.mocked(duoExclusionChecker.checkFileExclusion).mockReturnValue(exclusionResult);

        documentChangeCallback({ document: mockDocument }, eventType);

        expect(changeListener).toHaveBeenCalledWith(fileExclusionCheck);
      });
    });

    it('should dispose event listeners correctly', () => {
      const changeListener = jest.fn();
      const disposable = fileExclusionCheck.onChanged(changeListener);

      disposable.dispose();

      // Trigger a change to verify the listener was removed
      const onDocumentChangeMock = jest.mocked(documentService.onDocumentChange);
      const [[documentChangeCallback]] = onDocumentChangeMock.mock.calls;

      documentChangeCallback(
        { document: mockDocument },
        TextDocumentChangeListenerType.onDidSetActive,
      );

      expect(changeListener).not.toHaveBeenCalled();
    });
  });
});
