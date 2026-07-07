import { Disposable } from 'vscode-languageserver-protocol';
import { ApiReconfiguredData, Event } from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiClient } from '../../api';
import { DefaultTokenCheckNotifier, TokenCheckNotifier } from './token_check_notifier';

describe('TokenCheckNotifier', () => {
  let api: GitLabApiClient;
  let notifier: TokenCheckNotifier;

  beforeEach(() => {
    api = createFakePartial<GitLabApiClient>({
      onApiReconfigured: jest.fn(),
    });
  });

  it('registers API reconfigured handler that sends token check notifications', () => {
    let listener;
    const onApiReconfigured: Event<ApiReconfiguredData> = (
      l: (data: ApiReconfiguredData, signal: AbortSignal) => void,
    ): Disposable => {
      listener = l;
      return { dispose: jest.fn() };
    };
    api.onApiReconfigured = onApiReconfigured;

    const notify = jest.fn();

    notifier = new DefaultTokenCheckNotifier(api);
    notifier.init(notify);

    listener!({ isInValidState: false, validationMessage: 'error' });

    expect(notify).toHaveBeenCalledWith({ message: 'error' });
  });
});
