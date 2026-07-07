import { PublishDiagnosticsParams } from 'vscode-languageserver';

export type DiagnosticsPublisherFn = (data: PublishDiagnosticsParams) => Promise<void>;

export interface DiagnosticsPublisher {
  init(publish: DiagnosticsPublisherFn): void;
}
