import {
  ApiRequest,
  ExponentialBackoffCircuitBreaker,
  getLanguageServerVersion,
  getUserAgent,
  handleFetchError,
} from '@gitlab-org/core';
import { LsFetch } from '@gitlab-org/fetch';
import { guardWorkflowCall, type CreditLedgerFactory } from '@gitlab-org/credit-ledger';
import { CancellationToken } from 'vscode-languageserver';
import { ConfigService } from '@gitlab-org/config';
import { GitLabApiClient, CodeSuggestionRequest } from '../api';
import { log } from '../log';
import { toAbortSignal } from '../utils/cancellation_token_utils';
import { SECOND, MINUTE } from '../constants';
import {
  GENERATION,
  SuggestionClient,
  SuggestionContext,
  SuggestionResponse,
} from '../suggestion_client/suggestion_client';
import { createV2Request } from '../suggestion_client/create_v2_request';
import {
  DirectConnectionDetailsService,
  IDirectConnectionDetails,
} from './direct_connection_details_service';

export class DirectConnectionClient implements SuggestionClient {
  #api: GitLabApiClient;

  #directConnectionDetailsService: DirectConnectionDetailsService;

  #connectionDetails: IDirectConnectionDetails | undefined;

  #configService: ConfigService;

  #lsFetch: LsFetch;

  // Optional: present only when the credit ledger is wired in (see
  // deliverable/integration/02_wiring_code_suggestions.md). Undefined leaves
  // behavior unchanged.
  #creditLedgerFactory: CreditLedgerFactory | undefined;

  #creditSeq = 0;

  #isValidApi = true;

  #directConnectionCircuitBreaker = new ExponentialBackoffCircuitBreaker({
    initialBackoffMs: SECOND,
    maxBackoffMs: 10 * MINUTE,
    backoffMultiplier: 5,
  });

  constructor(
    api: GitLabApiClient,
    configService: ConfigService,
    directConnectionDetailsService: DirectConnectionDetailsService,
    lsFetch: LsFetch,
    creditLedgerFactory?: CreditLedgerFactory,
  ) {
    this.#api = api;
    this.#configService = configService;
    this.#directConnectionDetailsService = directConnectionDetailsService;
    this.#connectionDetails = undefined;
    this.#lsFetch = lsFetch;
    this.#creditLedgerFactory = creditLedgerFactory;
    this.#directConnectionCircuitBreaker.onOpen(() =>
      log.warn(
        'Sending code suggestions requests directly to GitLab cloud failed too many times, we will wait a while before trying again. In the meantime, suggestions requests will be sent to your GitLab instance.',
      ),
    );
    this.#api.onApiReconfigured(({ isInValidState }) => {
      this.#isValidApi = isInValidState;
      this.#directConnectionCircuitBreaker.success(); // resets the circuit breaker
      // TODO: fetch the direct connection details https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/239
    });
  }

  async #fetchUsingDirectConnection<T>(
    request: CodeSuggestionRequest,
    cancellationToken: CancellationToken,
  ): Promise<T> {
    if (!this.#connectionDetails) {
      throw new Error('Assertion error: connection details are undefined');
    }
    const suggestionEndpoint = `${this.#connectionDetails.base_url}/v2/completions`;
    const start = Date.now();

    const cancellationSignal = toAbortSignal(cancellationToken);
    const timeoutSignal = AbortSignal.timeout(5 * SECOND);
    const combinedSignal = AbortSignal.any([cancellationSignal, timeoutSignal]);

    const response = await this.#lsFetch.post(suggestionEndpoint, {
      body: JSON.stringify(request),
      headers: {
        ...this.#connectionDetails.headers,
        'User-Agent': getUserAgent(this.#configService.get('clientInfo')),
        Authorization: `Bearer ${this.#connectionDetails.token}`,
        'X-Gitlab-Authentication-Type': 'oidc',
        'X-Gitlab-Language-Server-Version': getLanguageServerVersion(),
        'Content-Type': 'application/json',
      },
      signal: combinedSignal,
    });
    const requestOnlyForErrorLogging: ApiRequest<unknown> = {
      type: 'rest',
      method: 'POST',
      path: suggestionEndpoint,
    };
    await handleFetchError(
      requestOnlyForErrorLogging,
      response,
      'Direct Connection for code suggestions',
    );
    const data = await response.json();
    const end = Date.now();
    log.debug(`Direct connection (${suggestionEndpoint}) suggestion fetched in ${end - start}ms`);
    return data;
  }

  #attributeCreditUsage(): void {
    if (!this.#creditLedgerFactory) return;
    this.#creditSeq += 1;
    const callId = `cs:${this.#creditSeq}:${Date.now()}`;
    this.#creditLedgerFactory
      .get()
      .then((ledger) => {
        const priced = ledger.attribute({ eventId: callId, feature: 'code_suggestions' });
        if (priced.unattributed) {
          log.warn(`credit-ledger: cs unattributed ${priced.reason ?? ''}`);
        }
        return undefined;
      })
      .catch((e) => log.warn('credit-ledger: cs attribution failed', e));
  }

  async getSuggestions(
    context: SuggestionContext,
    cancellationToken: CancellationToken,
  ): Promise<SuggestionResponse | undefined> {
    if (context.intent === GENERATION) {
      return undefined;
    }

    if (!this.#isValidApi) {
      return undefined;
    }

    if (this.#directConnectionCircuitBreaker.isOpen()) {
      return undefined;
    }

    await this.#directConnectionDetailsService.refreshIfNeeded(toAbortSignal(cancellationToken));
    this.#connectionDetails = this.#directConnectionDetailsService.details;

    const connectionDetails = this.#connectionDetails;
    if (!connectionDetails) {
      return undefined;
    }

    // Attribute one billable code-suggestions request BEFORE the network call,
    // so a burst mid-flight still counts. Per-request flat pricing; keep the
    // ledger monotonic (never decrement on failure — calibration handles it).
    this.#attributeCreditUsage();

    try {
      // Wrap the outbound suggestion request in the credit-ledger circuit
      // breaker (silent retarget + retry once on quota exhaustion).
      // Pass-through when the pool bridge is not enabled.
      const response = await guardWorkflowCall(() =>
        this.#fetchUsingDirectConnection<SuggestionResponse>(
          createV2Request(context, connectionDetails.model_details),
          cancellationToken,
        ),
      );
      return response && { ...response, isDirectConnection: true };
    } catch (e) {
      this.#directConnectionCircuitBreaker.error();
      log.warn(
        'Direct connection for code suggestions failed. Code suggestion requests will be sent to your GitLab instance.',
        e,
      );
    }

    return undefined;
  }
}
