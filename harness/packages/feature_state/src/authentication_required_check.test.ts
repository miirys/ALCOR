import { Disposable } from '@gitlab-org/disposable';
import {
  ApiReconfiguredData,
  EventListener,
  GitLabApiService,
  AUTHENTICATION_REQUIRED,
} from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultAuthenticationRequiredCheck } from './authentication_required_check';

describe('AuthenticationRequiredCheck', () => {
  const disposables: Disposable[] = [];

  let listeners: EventListener<ApiReconfiguredData>[] = [];

  let check: DefaultAuthenticationRequiredCheck;
  let mockApi: GitLabApiService;

  const checkEngagedChangeListener = jest.fn();

  beforeEach(() => {
    mockApi = createFakePartial<GitLabApiService>({
      fetchFromApi: jest.fn(),
      onApiReconfigured: jest.fn((listener) => {
        listeners.push(listener);
        return { dispose: () => {} };
      }),
    });

    check = new DefaultAuthenticationRequiredCheck(mockApi);
    disposables.push(check.onChanged(checkEngagedChangeListener));
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

  it('should be engaged when api is in invalid state', async () => {
    await reconfigureApi({ isInValidState: false, validationMessage: '' });

    expect(check.id).toBe(AUTHENTICATION_REQUIRED);
    expect(check.engaged).toBeTruthy();
  });

  it('should not be engaged when api is in valid state', async () => {
    // reconfigureApi always puts the api in a valid state by default.
    await reconfigureApi();

    expect(check.id).toBe(AUTHENTICATION_REQUIRED);
    expect(check.engaged).toBeFalsy();
  });
});
