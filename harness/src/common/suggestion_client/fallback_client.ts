import { CancellationToken } from 'vscode-languageserver';
import { SuggestionClient, SuggestionContext } from './suggestion_client';

export class FallbackClient implements SuggestionClient {
  #clients: SuggestionClient[];

  constructor(...clients: SuggestionClient[]) {
    this.#clients = clients;
  }

  async getSuggestions(context: SuggestionContext, cancellationToken: CancellationToken) {
    for (const client of this.#clients) {
      // eslint-disable-next-line no-await-in-loop
      const result = await client.getSuggestions(context, cancellationToken);
      if (result) {
        // TODO create a follow up issue to consider scenario when the result is defined, but it contains an error field
        return result;
      }
    }
    return undefined;
  }
}
