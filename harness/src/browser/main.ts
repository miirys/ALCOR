import EventEmitter from 'events';
import {
  ProposedFeatures,
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
  TextDocuments,
} from 'vscode-languageserver/browser';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ServiceCollection, createInstanceDescriptor } from '@gitlab/needle';
import {
  getLanguageServerVersion,
  LsConnection,
  LsTextDocuments,
  DefaultInstanceFeatureFlagsService,
} from '@gitlab-org/core';
import { LsFetch } from '@gitlab-org/fetch';
import { LogWriter } from '@gitlab-org/logging';
import { browserGitCommandsContributions } from '@gitlab-org/repositories/browser';
import { ConfigService } from '@gitlab-org/config';
import { NoopSentryTracker } from '@gitlab-org/errors';
import { EmptySandboxAvailabilityService } from '@gitlab-org/sandbox/empty';
import {
  commonContributions,
  DefaultStreamingHandler,
  log,
  DefaultDocumentService,
  DocumentService,
  DefaultTokenCheckNotifier,
  ConnectionService,
  DefaultConnectionService,
  DefaultDirectoryWalker,
  DefaultSuggestionService,
  DefaultVirtualFileSystemService,
  DefaultRepositoryService,
  EmptyFsClient,
} from '@gitlab-org/legacy-common';
import { Fetch } from './fetch';
import { BrowserTreeSitterParser } from './tree_sitter';
import { BrowserProjectService } from './services/browser_project_service';

async function main() {
  // eslint-disable-next-line no-restricted-globals
  const worker: Worker = self as unknown as Worker;
  const messageReader = new BrowserMessageReader(worker);
  const messageWriter = new BrowserMessageWriter(worker);

  const serviceCollection = new ServiceCollection();

  const lsFetch = new Fetch();
  serviceCollection.add(
    createInstanceDescriptor({
      aliases: [LsFetch],
      instance: lsFetch,
    }),
  );

  const connection = createConnection(ProposedFeatures.all, messageReader, messageWriter);

  serviceCollection.add(
    createInstanceDescriptor({
      aliases: [LsConnection],
      instance: connection,
    }),
  );

  const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
  serviceCollection.add(
    createInstanceDescriptor({
      aliases: [LsTextDocuments],
      instance: documents,
    }),
  );

  const documentService = new DefaultDocumentService(documents);
  serviceCollection.add(
    createInstanceDescriptor({
      aliases: [DocumentService],
      instance: documentService,
    }),
  );

  // We have many components listening to changes to API and Config and so we increase the default (10) limit on listeners
  // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/585
  EventEmitter.defaultMaxListeners = 30;

  serviceCollection.add(
    createInstanceDescriptor({
      aliases: [LogWriter],
      instance: { write: (msg: string) => connection.console.log(msg) },
    }),
  );

  serviceCollection.addClass(
    ...commonContributions,
    ...browserGitCommandsContributions,
    DefaultTokenCheckNotifier,
    DefaultDirectoryWalker,
    DefaultInstanceFeatureFlagsService,
    NoopSentryTracker,
    DefaultVirtualFileSystemService,
    DefaultRepositoryService,
    EmptyFsClient,
    EmptySandboxAvailabilityService,
    DefaultStreamingHandler,
    DefaultConnectionService,
    DefaultSuggestionService,
    BrowserTreeSitterParser,
    BrowserProjectService,
  );

  const container = serviceCollection.build();

  const connectionService = container.getRequiredService(ConnectionService);

  await connectionService.initialize();

  // Use connection.console.log for browser to send logs to VS Code output channel
  log.setup(container.getRequiredService(ConfigService), {
    write: (msg: string) => connection.console.log(msg),
  });

  const version = getLanguageServerVersion();
  log.info(`GitLab Language Server is starting (v${version})`);

  await lsFetch.initialize();

  // Make the text document manager listen on the connection for open, change and close text document events
  documents.listen(connection);
  // Listen on the connection
  connection.listen();

  log.info('GitLab Language Server has started');
}

main().catch((e) => log.error(e));
