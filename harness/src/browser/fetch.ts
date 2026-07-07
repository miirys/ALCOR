import { CancellationToken } from 'vscode-languageserver-protocol';
import { FetchBase, LsFetch } from '@gitlab-org/fetch';

/**
 * Apart from streaming, this browser implementation doesn't do anything
 * as proxy handling should be automatic.
 */
export class Fetch extends FetchBase implements LsFetch {
  /**
   * Browser-specific fetch implementation.
   * See https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/171 for details
   *
   * Note: we yield chunks of the stream as strings,
   * as the caller is responsible for aggregating them
   */
  async *streamResponse(
    response: Response,
    cancellationToken: CancellationToken,
  ): AsyncGenerator<string, void, void> {
    const reader = response?.body?.getReader();
    if (!reader) {
      return undefined;
    }

    let readResult = await reader.read();

    while (!readResult.done) {
      if (cancellationToken.isCancellationRequested) {
        // eslint-disable-next-line no-await-in-loop
        await reader.cancel();
        return undefined;
      }
      // TODO: We should consider streaming the raw bytes instead of the decoded string
      const rawContent = new TextDecoder().decode(readResult.value);
      // TODO if we cancel the stream, and nothing will consume it, we probably leave the HTTP connection open :-O
      yield rawContent;

      // eslint-disable-next-line no-await-in-loop
      readResult = await reader.read();
    }

    return undefined;
  }
}
