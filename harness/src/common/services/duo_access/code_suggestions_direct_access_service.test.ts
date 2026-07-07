import { Disposable } from '@gitlab-org/disposable';
import { ApiReconfiguredData, EventListener, ApiRequest, RESTError } from '@gitlab-org/core';
import { AbortError, retry } from '@gitlab-org/resiliency';
import { createFakePartial, createFakeResponse } from '@gitlab-org/test-utils';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { ConfigService } from '@gitlab-org/config';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { GitLabApiClient } from '../../api';
import { DefaultCodeSuggestionsDirectAccessService } from './code_suggestions_direct_access_service';

jest.mock('@gitlab-org/resiliency');

describe('DefaultCodeSuggestionsDirectAccessService', () => {
  const disposables: Disposable[] = [];

  let listeners: EventListener<ApiReconfiguredData>[] = [];

  let service: DefaultCodeSuggestionsDirectAccessService;
  let mockApi: GitLabApiClient;
  let mockConfigService: ConfigService;
  let mockLogger: Logger;
  let fetchOperation = jest.fn();

  const resultListener = jest.fn();

  beforeEach(() => {
    fetchOperation = jest.fn().mockResolvedValue({ status: 200, choices: [] });
    jest.mocked(retry).mockImplementation((factory) => factory(new AbortController().signal));
    mockApi = createFakePartial<GitLabApiClient>({
      fetchOperation: jest.fn().mockReturnValue(fetchOperation),
      isInValidState: false,
      onApiReconfigured: jest.fn((listener) => {
        listeners.push(listener);
        return { dispose: () => {} };
      }),
    });
    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn(),
    });
    mockLogger = new TestLogger();

    service = new DefaultCodeSuggestionsDirectAccessService(mockApi, mockConfigService, mockLogger);
    disposables.push(service.onResult(resultListener));
  });

  afterEach(() => {
    listeners = [];

    while (disposables.length > 0) {
      disposables.pop()!.dispose();
    }
  });

  const reconfigureApi = async (
    data: ApiReconfiguredData = createFakePartial<ApiReconfiguredData>({ isInValidState: true }),
  ) => {
    listeners.forEach((listener) => listener(data, new AbortController().signal));

    await new Promise(process.nextTick);
  };

  const successResponse = {
    status: 200,
    choices: [],
  };

  const quotaExceededResponse = {
    error_code: 'USAGE_QUOTA_EXCEEDED',
    error: 'insufficient_credits',
  };

  describe('result emission on api reconfiguration', () => {
    it('should emit success when API call succeeds with 200', async () => {
      jest.mocked(fetchOperation).mockResolvedValueOnce(successResponse);

      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);
      expect(resultListener).toHaveBeenCalledWith({ status: 'success' });
    });

    it('should emit credits_exceeded when API returns 402 with USAGE_QUOTA_EXCEEDED', async () => {
      const response = createFakeResponse({
        url: 'https://example.com/api/v4/code_suggestions/direct_access',
        status: 402,
        text: JSON.stringify(quotaExceededResponse),
      });
      const request = createFakePartial<ApiRequest<unknown>>({});
      jest
        .mocked(fetchOperation)
        .mockRejectedValueOnce(
          new RESTError(request, response, 'direct_access', JSON.stringify(quotaExceededResponse)),
        );

      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);
      expect(resultListener).toHaveBeenCalledWith({ status: 'credits_exceeded' });
    });

    it('should emit error when check fails with non-quota error', async () => {
      const error = new Error('Network error');
      jest.mocked(fetchOperation).mockRejectedValueOnce(error);

      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);
      expect(resultListener).toHaveBeenCalledWith({ status: 'error', error });
    });

    it('should emit missing_default_namespace when API returns 422', async () => {
      const missingNamespaceResponse = {
        error: 'missing_default_duo_group',
        message: 'Missing default namespace',
      };
      const response = createFakeResponse({
        url: 'https://example.com/api/v4/code_suggestions/direct_access',
        status: 422,
        text: JSON.stringify(missingNamespaceResponse),
      });
      const request = createFakePartial<ApiRequest<unknown>>({});
      jest
        .mocked(fetchOperation)
        .mockRejectedValueOnce(
          new RESTError(
            request,
            response,
            'direct_access',
            JSON.stringify(missingNamespaceResponse),
          ),
        );

      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);
      expect(resultListener).toHaveBeenCalledWith({ status: 'missing_default_namespace' });
    });

    it('should not emit when api is reconfigured in an invalid state', async () => {
      jest.mocked(fetchOperation).mockResolvedValueOnce(successResponse);
      await reconfigureApi();

      jest.mocked(resultListener).mockClear();

      await reconfigureApi({ isInValidState: false, validationMessage: 'error' });

      await new Promise(process.nextTick);
      expect(resultListener).not.toHaveBeenCalled();
    });

    it('should not change state on abort error', async () => {
      const response = createFakeResponse({
        url: 'https://example.com/api/v4/code_suggestions/direct_access',
        status: 402,
        text: JSON.stringify(quotaExceededResponse),
      });
      const request = createFakePartial<ApiRequest<unknown>>({});
      jest
        .mocked(fetchOperation)
        .mockRejectedValueOnce(
          new RESTError(request, response, 'direct_access', JSON.stringify(quotaExceededResponse)),
        );

      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);

      jest.mocked(resultListener).mockClear();

      jest.mocked(fetchOperation).mockRejectedValueOnce(new AbortError());

      await reconfigureApi();

      expect(resultListener).not.toHaveBeenCalled();
    });

    it('should not change state on invalid instance version error', async () => {
      const response = createFakeResponse({
        url: 'https://example.com/api/v4/code_suggestions/direct_access',
        status: 402,
        text: JSON.stringify(quotaExceededResponse),
      });
      const request = createFakePartial<ApiRequest<unknown>>({});
      jest
        .mocked(fetchOperation)
        .mockRejectedValueOnce(
          new RESTError(request, response, 'direct_access', JSON.stringify(quotaExceededResponse)),
        );

      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);

      jest.mocked(resultListener).mockClear();

      jest
        .mocked(fetchOperation)
        .mockRejectedValueOnce(new InvalidInstanceVersionError('Version too old'));

      await reconfigureApi();

      expect(resultListener).not.toHaveBeenCalled();
    });
  });

  describe('initialization', () => {
    it('should fetch on initialization if API is in valid state', async () => {
      jest.mocked(fetchOperation).mockResolvedValueOnce(successResponse);

      const newService = new DefaultCodeSuggestionsDirectAccessService(
        mockApi,
        mockConfigService,
        mockLogger,
      );

      await new Promise(process.nextTick);

      const listener = jest.fn();
      newService.onResult(listener);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should not fetch on initialization if API is not in valid state', async () => {
      const invalidApi = createFakePartial<GitLabApiClient>({
        isInValidState: false,
        onApiReconfigured: jest.fn(() => ({ dispose: () => {} })),
      });

      const newService = new DefaultCodeSuggestionsDirectAccessService(
        invalidApi,
        mockConfigService,
        mockLogger,
      );

      await new Promise(process.nextTick);

      const listener = jest.fn();
      newService.onResult(listener);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('result deduplication', () => {
    it('should not emit duplicate results when status has not changed', async () => {
      jest.mocked(fetchOperation).mockResolvedValueOnce(successResponse);
      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);

      jest.mocked(resultListener).mockClear();

      jest.mocked(fetchOperation).mockResolvedValueOnce(successResponse);
      await reconfigureApi();

      expect(resultListener).not.toHaveBeenCalled();
    });

    it('should not emit duplicate credits_exceeded results', async () => {
      const response = createFakeResponse({
        url: 'https://example.com/api/v4/code_suggestions/direct_access',
        status: 402,
        text: JSON.stringify(quotaExceededResponse),
      });
      const request = createFakePartial<ApiRequest<unknown>>({});
      const error = new RESTError(
        request,
        response,
        'direct_access',
        JSON.stringify(quotaExceededResponse),
      );

      jest.mocked(fetchOperation).mockRejectedValueOnce(error);
      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);
      expect(resultListener).toHaveBeenCalledWith({ status: 'credits_exceeded' });

      jest.mocked(resultListener).mockClear();

      jest.mocked(fetchOperation).mockRejectedValueOnce(error);
      await reconfigureApi();

      expect(resultListener).not.toHaveBeenCalled();
    });

    it('should emit when transitioning from success to credits_exceeded', async () => {
      jest.mocked(fetchOperation).mockResolvedValueOnce(successResponse);
      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);
      expect(resultListener).toHaveBeenCalledWith({ status: 'success' });

      jest.mocked(resultListener).mockClear();

      const response = createFakeResponse({
        url: 'https://example.com/api/v4/code_suggestions/direct_access',
        status: 402,
        text: JSON.stringify(quotaExceededResponse),
      });
      const request = createFakePartial<ApiRequest<unknown>>({});
      jest
        .mocked(fetchOperation)
        .mockRejectedValueOnce(
          new RESTError(request, response, 'direct_access', JSON.stringify(quotaExceededResponse)),
        );

      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);
      expect(resultListener).toHaveBeenCalledWith({ status: 'credits_exceeded' });
    });

    it('should emit when transitioning from credits_exceeded to success', async () => {
      const response = createFakeResponse({
        url: 'https://example.com/api/v4/code_suggestions/direct_access',
        status: 402,
        text: JSON.stringify(quotaExceededResponse),
      });
      const request = createFakePartial<ApiRequest<unknown>>({});
      jest
        .mocked(fetchOperation)
        .mockRejectedValueOnce(
          new RESTError(request, response, 'direct_access', JSON.stringify(quotaExceededResponse)),
        );

      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);
      expect(resultListener).toHaveBeenCalledWith({ status: 'credits_exceeded' });

      jest.mocked(resultListener).mockClear();

      jest.mocked(fetchOperation).mockResolvedValueOnce(successResponse);
      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);
      expect(resultListener).toHaveBeenCalledWith({ status: 'success' });
    });

    it('should emit when transitioning from missing_default_namespace to success', async () => {
      const missingNamespaceResponse = {
        error: 'missing_default_duo_group',
        message: 'Missing default namespace',
      };
      const response = createFakeResponse({
        url: 'https://example.com/api/v4/code_suggestions/direct_access',
        status: 422,
        text: JSON.stringify(missingNamespaceResponse),
      });
      const request = createFakePartial<ApiRequest<unknown>>({});
      jest
        .mocked(fetchOperation)
        .mockRejectedValueOnce(
          new RESTError(
            request,
            response,
            'direct_access',
            JSON.stringify(missingNamespaceResponse),
          ),
        );

      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);
      expect(resultListener).toHaveBeenCalledWith({ status: 'missing_default_namespace' });

      jest.mocked(resultListener).mockClear();

      jest.mocked(fetchOperation).mockResolvedValueOnce(successResponse);
      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);
      expect(resultListener).toHaveBeenCalledWith({ status: 'success' });
    });

    it('should emit error only once when status changes from success to error', async () => {
      jest.mocked(fetchOperation).mockResolvedValueOnce(successResponse);
      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);

      jest.mocked(resultListener).mockClear();

      const error = new Error('Network error');
      jest.mocked(fetchOperation).mockRejectedValueOnce(error);
      await reconfigureApi();

      expect(resultListener).toHaveBeenCalledTimes(1);
      expect(resultListener).toHaveBeenCalledWith({ status: 'error', error });

      jest.mocked(resultListener).mockClear();

      const error2 = new Error('Another network error');
      jest.mocked(fetchOperation).mockRejectedValueOnce(error2);
      await reconfigureApi();

      expect(resultListener).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should dispose all subscriptions', () => {
      const disposeSpy = jest.fn();
      jest.mocked(mockApi.onApiReconfigured).mockReturnValueOnce({
        dispose: disposeSpy,
      });

      const newService = new DefaultCodeSuggestionsDirectAccessService(
        mockApi,
        mockConfigService,
        mockLogger,
      );
      newService.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should remove all listeners from result emitter', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      disposables.push(service.onResult(listener1));
      disposables.push(service.onResult(listener2));

      service.dispose();

      jest.mocked(fetchOperation).mockResolvedValueOnce(successResponse);
      await reconfigureApi();

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });
});
