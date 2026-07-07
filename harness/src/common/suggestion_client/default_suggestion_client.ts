import { CancellationToken } from 'vscode-languageserver';
import { GitLabApiClient } from '../api';
import { createV2Request } from './create_v2_request';
import { SuggestionClient, SuggestionContext, SuggestionResponse } from './suggestion_client';

export class DefaultSuggestionClient implements SuggestionClient {
  readonly #api: GitLabApiClient;

  constructor(api: GitLabApiClient) {
    this.#api = api;
  }

  async getSuggestions(
    suggestionContext: SuggestionContext,
    cancellationToken: CancellationToken,
  ): Promise<SuggestionResponse | undefined> {
    const response = await this.#api.getCodeSuggestions(
      createV2Request(suggestionContext),
      cancellationToken,
    );
    return response && { ...response, isDirectConnection: false };
  }
}
