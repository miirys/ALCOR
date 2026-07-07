import { type ApiRequest, FetchError } from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ErrorNotifier } from '@gitlab-org/errors';
import {
  DefaultSuggestionApiErrorCheck,
  SuggestionApiErrorCheck,
} from './suggestion_api_error_check';
import {
  DefaultSuggestionApiErrorNotifier,
  SuggestionApiErrorNotifier,
} from './suggestion_api_error_notifier';

describe('SuggestionApiErrorNotifier', () => {
  let apiErrorCheck: SuggestionApiErrorCheck;
  let notifier: SuggestionApiErrorNotifier;
  let errorNotifyFn: jest.Mock;
  let recoveryNotifyFn: jest.Mock;
  const mockErrorNotifier = createFakePartial<ErrorNotifier>({
    showErrorMessage: jest.fn(),
  });

  beforeEach(() => {
    apiErrorCheck = new DefaultSuggestionApiErrorCheck();
    notifier = new DefaultSuggestionApiErrorNotifier(apiErrorCheck, mockErrorNotifier);
    errorNotifyFn = jest.fn().mockResolvedValue(undefined);
    recoveryNotifyFn = jest.fn().mockResolvedValue(undefined);
    notifier.setErrorNotifyFn(errorNotifyFn);
    notifier.setRecoveryNotifyFn(recoveryNotifyFn);
  });

  afterEach(() => {
    apiErrorCheck.success(); // clears the timer
  });

  it('sends error notification', () => {
    apiErrorCheck.error();
    apiErrorCheck.error();
    apiErrorCheck.error();
    apiErrorCheck.error();

    expect(errorNotifyFn).toHaveBeenCalled();
  });

  it('sends recovery notification', () => {
    apiErrorCheck.error();
    apiErrorCheck.error();
    apiErrorCheck.error();
    apiErrorCheck.error();

    apiErrorCheck.success();
    expect(recoveryNotifyFn).toHaveBeenCalled();
  });

  describe('mockErrorNotifier', () => {
    it('calls error notifier on missing default duo namespace error', () => {
      const request = createFakePartial<ApiRequest<unknown>>({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/code_suggestions/completions',
      });
      const response = createFakePartial<Response>({
        ok: false,
        url: 'https://example.com/api/v4/code_suggestions/completions',
        status: 422,
      });
      const body = `{ "error": "missing_default_duo_group" }`;

      const mockError = new FetchError(request, response, 'resource name', body);
      apiErrorCheck.error(mockError);
      apiErrorCheck.error(mockError);
      apiErrorCheck.error(mockError);
      apiErrorCheck.error(mockError);

      expect(mockErrorNotifier.showErrorMessage).toHaveBeenCalledWith({
        message:
          'Multiple GitLab Duo namespaces detected. In your user preferences, select a default GitLab Duo namespace.',
        docUrl:
          'https://docs.gitlab.com/user/profile/preferences/#set-a-default-gitlab-duo-namespace',
      });
    });
  });
  it('does not call error notifier for other errors', () => {
    apiErrorCheck.error();
    apiErrorCheck.error();
    apiErrorCheck.error();
    apiErrorCheck.error();
    expect(mockErrorNotifier.showErrorMessage).not.toHaveBeenCalled();
  });
});
