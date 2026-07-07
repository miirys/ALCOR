import { EventEmitter } from 'events';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WorkspaceFolder } from 'vscode-languageserver';
import { Disposable } from '@gitlab-org/disposable';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { SUGGESTIONS_FILE_EXCLUDED } from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { URI } from 'vscode-uri';
import { ConfigService } from '@gitlab-org/config';
import { getRelativePath } from '@gitlab-org/fs';
import { StateCheck, StateCheckChangedEventData } from '@gitlab-org/feature-state';
import { DocumentService } from '../document_service';
import { TextDocumentChangeListenerType } from '../text_document_change_listener_type';
import { DuoExclusionChecker, DuoProjectAccessChecker } from '../services/duo_access';

export interface CodeSuggestionsFileExclusionCheck
  extends StateCheck<typeof SUGGESTIONS_FILE_EXCLUDED> {}

export const CodeSuggestionsFileExclusionCheck =
  createInterfaceId<CodeSuggestionsFileExclusionCheck>('CodeSuggestionsFileExclusionCheck');

@Injectable(CodeSuggestionsFileExclusionCheck, [
  DocumentService,
  DuoExclusionChecker,
  DuoProjectAccessChecker,
  ConfigService,
  Logger,
])
export class DefaultCodeSuggestionsFileExclusionCheck implements CodeSuggestionsFileExclusionCheck {
  #documentService: DocumentService;

  #duoExclusionChecker: DuoExclusionChecker;

  #duoProjectAccessChecker: DuoProjectAccessChecker;

  #configService: ConfigService;

  #isFileExcluded = false;

  #currentDocument?: TextDocument;

  #stateEmitter = new EventEmitter();

  readonly #logger: Logger;

  #documentChangeDisposable?: Disposable;

  #configChangeDisposable?: Disposable;

  constructor(
    documentService: DocumentService,
    duoExclusionChecker: DuoExclusionChecker,
    duoProjectAccessChecker: DuoProjectAccessChecker,
    configService: ConfigService,
    logger: Logger,
  ) {
    this.#documentService = documentService;
    this.#duoExclusionChecker = duoExclusionChecker;
    this.#duoProjectAccessChecker = duoProjectAccessChecker;
    this.#configService = configService;
    this.#logger = withPrefix(logger, `[CodeSuggestionsFileExclusionCheck]`);

    this.#documentChangeDisposable = this.#documentService.onDocumentChange(
      (event, handlerType) => {
        if (
          handlerType === TextDocumentChangeListenerType.onDidSetActive ||
          handlerType === TextDocumentChangeListenerType.onDidOpen
        ) {
          this.#updateWithDocument(event.document);
        }
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.#configChangeDisposable = this.#configService.onConfigChange((_config) => {
      this.#update();
    });
  }

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    this.#stateEmitter.on('change', listener);
    return {
      dispose: () => this.#stateEmitter.removeListener('change', listener),
    };
  }

  #updateWithDocument(document: TextDocument) {
    this.#currentDocument = document;
    this.#update();
  }

  get engaged() {
    return this.#isFileExcluded;
  }

  get id() {
    return SUGGESTIONS_FILE_EXCLUDED;
  }

  details = 'File is excluded by project exclusion rules';

  dispose(): void {
    this.#documentChangeDisposable?.dispose();
    this.#configChangeDisposable?.dispose();
    this.#stateEmitter.removeAllListeners();
  }

  #update() {
    this.#checkFileExclusion();
    this.#stateEmitter.emit('change', this);
  }

  #checkFileExclusion() {
    if (!this.#currentDocument) {
      this.#isFileExcluded = false;
      return;
    }

    try {
      // Get the workspace folder for the current document
      const workspaceFolder = this.#getMatchingWorkspaceFolder(this.#currentDocument.uri);
      if (!workspaceFolder) {
        this.#isFileExcluded = false;
        return;
      }

      // Check project status to get the project with exclusion rules
      const { project } = this.#duoProjectAccessChecker.checkProjectStatus(
        this.#currentDocument.uri,
        workspaceFolder,
      );

      if (!project) {
        this.#isFileExcluded = false;
        return;
      }

      // Get relative file path for exclusion checking
      const relativePath = getRelativePath(
        URI.parse(workspaceFolder.uri),
        URI.parse(this.#currentDocument.uri),
      );

      if (!relativePath) {
        this.#isFileExcluded = false;
        return;
      }

      // Check if the file is excluded
      const exclusionResult = this.#duoExclusionChecker.checkFileExclusion(relativePath, project);

      this.#isFileExcluded = exclusionResult.isExcluded;

      if (this.#isFileExcluded) {
        this.#logger.debug(
          `${this.#currentDocument?.uri} is excluded by Duo Context Exclusion settings`,
        );
      }
    } catch {
      // If there's an error checking exclusion, default to not excluded
      this.#isFileExcluded = false;
    }
  }

  #getMatchingWorkspaceFolder(fileUri: string): WorkspaceFolder | undefined {
    const workspaceFolders = this.#configService.get('workspaceFolders') ?? [];
    return workspaceFolders.find((wf) => fileUri.startsWith(wf.uri));
  }
}
