import { WorkflowStatusCode } from '@gitlab-lsp/workflow-api';
import { WebsocketStreamError, mapClientErrorToUserFacingStatusCode } from './errors';

describe('mapClientErrorToUserFacingStatusCode', () => {
  describe.each([
    {
      description: 'TLS certificate verification errors',
      errorInput: new Error('unable to verify the first certificate'),
      expectedStatusCode: WorkflowStatusCode.MISSING_CERTIFICATE_SETTINGS,
    },
    {
      description: 'USAGE_QUOTA_EXCEEDED errors',
      errorInput: new Error('USAGE_QUOTA_EXCEEDED'),
      expectedStatusCode: WorkflowStatusCode.USAGE_QUOTA_EXCEEDED,
    },
  ])('when receiving $description', ({ errorInput, expectedStatusCode }) => {
    it(`should return ${expectedStatusCode}`, () => {
      expect(mapClientErrorToUserFacingStatusCode(errorInput)).toBe(expectedStatusCode);
    });
  });

  describe('when receiving WebsocketStreamError', () => {
    describe.each([
      {
        description: 'code 1003 (Unsupported Data)',
        code: 1003,
        expectedStatusCode: WorkflowStatusCode.SERVICE_CONNECTION_UNSUPPORTED_DATA_TYPE,
      },
      {
        description: 'code 1007 (Invalid frame payload data)',
        code: 1007,
        expectedStatusCode: WorkflowStatusCode.SERVICE_CONNECTION_UNSUPPORTED_DATA_TYPE,
      },
      {
        description: 'code 1006 (Abnormal Closure)',
        code: 1006,
        expectedStatusCode: WorkflowStatusCode.SERVICE_CONNECTION_DROPPED,
      },
      {
        description: 'code 1009 (Message Too Big)',
        code: 1009,
        expectedStatusCode: WorkflowStatusCode.SERVICE_CONNECTION_CLOSED_MESSAGE_TOO_BIG,
      },
      {
        description: 'code 1011 (Internal Error)',
        code: 1011,
        expectedStatusCode: WorkflowStatusCode.SERVICE_CONNECTION_INTERNAL_ERROR,
      },
      {
        description: 'code 1013 (Try again later)',
        code: 1013,
        expectedStatusCode: WorkflowStatusCode.LOCKED_SOCKET,
      },
      {
        description: 'code 1014 (Bad Gateway)',
        code: 1014,
        expectedStatusCode: WorkflowStatusCode.SERVICE_CONNECTION_BAD_GATEWAY,
      },
      {
        description: 'code 1015 (TLS handshake)',
        code: 1015,
        expectedStatusCode: WorkflowStatusCode.SERVICE_CONNECTION_TLS_HANDSHAKE,
      },
      {
        description: 'HTTP 401 (Unauthorized upgrade)',
        code: 401,
        expectedStatusCode: WorkflowStatusCode.AUTH_TOKEN_ERROR,
      },
      {
        description: 'HTTP 403 (Forbidden upgrade)',
        code: 403,
        expectedStatusCode: WorkflowStatusCode.AUTH_TOKEN_ERROR,
      },
      {
        description: 'HTTP 407 (Proxy Authentication Required)',
        code: 407,
        expectedStatusCode: WorkflowStatusCode.AUTH_TOKEN_ERROR,
      },
    ])('with $description', ({ code, expectedStatusCode }) => {
      it(`should return ${expectedStatusCode}`, () => {
        const error = new WebsocketStreamError('WebSocket closed abnormally', code, 'test reason');
        expect(mapClientErrorToUserFacingStatusCode(error)).toBe(expectedStatusCode);
      });
    });

    describe('when WebsocketStreamError has unknown code', () => {
      it('should return GENERAL_FAILURE', () => {
        const error = new WebsocketStreamError(
          'WebSocket closed abnormally',
          9999,
          'unknown reason',
        );
        expect(mapClientErrorToUserFacingStatusCode(error)).toBe(
          WorkflowStatusCode.GENERAL_FAILURE,
        );
      });
    });

    describe('when WebsocketStreamError has no code', () => {
      it('should return GENERAL_FAILURE', () => {
        const error = new WebsocketStreamError('WebSocket closed abnormally');
        expect(mapClientErrorToUserFacingStatusCode(error)).toBe(
          WorkflowStatusCode.GENERAL_FAILURE,
        );
      });
    });
  });

  describe('when receiving unknown error types', () => {
    it.each([
      { description: 'null', errorInput: null },
      { description: 'undefined', errorInput: undefined },
      { description: 'number', errorInput: 42 },
      { description: 'object', errorInput: { message: 'some object' } },
      { description: 'generic Error', errorInput: new Error('generic error') },
    ])('should return GENERAL_FAILURE for $description', ({ errorInput }) => {
      expect(mapClientErrorToUserFacingStatusCode(errorInput)).toBe(
        WorkflowStatusCode.GENERAL_FAILURE,
      );
    });
  });
});
