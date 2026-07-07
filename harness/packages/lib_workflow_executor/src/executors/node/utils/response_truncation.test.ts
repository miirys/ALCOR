import { HttpResponse, PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import {
  isPlaintextResponse,
  createTruncatedPlainTextResponse,
  createTruncatedPlainTextErrorResponse,
  createTruncatedHttpErrorResponse,
  createSizeLimitExceededResponse,
  createSerializationErrorResponse,
} from './response_truncation';

describe('response_truncation', () => {
  const createLargeString = (prefix: string, size = 1100): string => {
    const baseContent = `${prefix} - This is a large content that will be truncated.`;
    const repeatCount = Math.ceil(size / baseContent.length);
    return baseContent.repeat(repeatCount).substring(0, size);
  };

  describe('isPlaintextResponse', () => {
    it('returns true for PlainTextResponse', () => {
      const response: PlainTextResponse = { response: 'test', error: '' };
      expect(isPlaintextResponse(response)).toBe(true);
    });

    it('returns false for HttpResponse', () => {
      const response: HttpResponse = {
        headers: {},
        statusCode: 200,
        body: 'test',
        error: '',
      };
      expect(isPlaintextResponse(response)).toBe(false);
    });
  });

  describe('createTruncatedPlainTextResponse', () => {
    it('truncates large response with suffix', () => {
      const largeResponse = createLargeString('Large response content');
      const response: PlainTextResponse = {
        response: largeResponse,
        error: '',
      };

      const result = createTruncatedPlainTextResponse(response, 'test-request-id');

      expect(result.actionResponse!.requestID).toBe('test-request-id');
      expect(result.actionResponse!.plainTextResponse!.response).toContain(
        'Large response content',
      );
      expect(result.actionResponse!.plainTextResponse!.response).toContain(
        '[Large response truncated...]',
      );
      expect(result.actionResponse!.plainTextResponse!.response.length).toBeLessThanOrEqual(1024);
    });

    it('handles empty response', () => {
      const response: PlainTextResponse = {
        response: '',
        error: '',
      };

      const result = createTruncatedPlainTextResponse(response, 'test-request-id');

      expect(result.actionResponse!.plainTextResponse!.response).toBe('');
    });

    it('does not include error field', () => {
      const response: PlainTextResponse = {
        response: 'test response',
        error: '',
      };

      const result = createTruncatedPlainTextResponse(response, 'test-request-id');

      expect(result.actionResponse!.plainTextResponse!.error).toBe('');
    });
  });

  describe('createTruncatedPlainTextErrorResponse', () => {
    it('truncates large response and includes error message', () => {
      const largeResponse = createLargeString('Large response content');
      const response: PlainTextResponse = {
        response: largeResponse,
        error: '',
      };

      const result = createTruncatedPlainTextErrorResponse(
        response,
        'test-request-id',
        'Test error message',
      );

      expect(result.actionResponse!.requestID).toBe('test-request-id');
      expect(result.actionResponse!.plainTextResponse!.response).toContain(
        'Large response content',
      );
      expect(result.actionResponse!.plainTextResponse!.response).toContain(
        '[Large response truncated...]',
      );
      expect(result.actionResponse!.plainTextResponse!.error).toBe('Test error message');
    });

    it('appends original error when present', () => {
      const largeError = createLargeString('Large error message');
      const response: PlainTextResponse = {
        response: 'Small response',
        error: largeError,
      };

      const result = createTruncatedPlainTextErrorResponse(
        response,
        'test-request-id',
        'Base error',
      );

      expect(result.actionResponse!.plainTextResponse!.error).toContain('Base error');
      expect(result.actionResponse!.plainTextResponse!.error).toContain(
        'Original result container error:',
      );
      expect(result.actionResponse!.plainTextResponse!.error).toContain('Large error message');
      expect(result.actionResponse!.plainTextResponse!.error).toContain(
        '[Large error truncated...]',
      );
    });

    it('handles empty original error', () => {
      const response: PlainTextResponse = {
        response: 'test response',
        error: '',
      };

      const result = createTruncatedPlainTextErrorResponse(
        response,
        'test-request-id',
        'Test error',
      );

      expect(result.actionResponse!.plainTextResponse!.error).toBe('Test error');
    });
  });

  describe('createTruncatedHttpErrorResponse', () => {
    it('truncates large body and includes error message', () => {
      const largeBody = createLargeString('Large HTTP response body');
      const response: HttpResponse = {
        headers: { 'content-type': 'application/json', 'x-custom': 'test-header' },
        statusCode: 200,
        body: largeBody,
        error: '',
      };

      const result = createTruncatedHttpErrorResponse(
        response,
        'test-request-id',
        'Test error message',
      );

      expect(result.actionResponse!.requestID).toBe('test-request-id');
      expect(result.actionResponse!.httpResponse!.body).toContain('Large HTTP response body');
      expect(result.actionResponse!.httpResponse!.body).toContain(
        '[Large response body truncated...]',
      );
      expect(result.actionResponse!.httpResponse!.body.length).toBeLessThanOrEqual(1024);
      expect(result.actionResponse!.httpResponse!.error).toBe('Test error message');
      expect(result.actionResponse!.httpResponse!.headers).toEqual({
        'content-type': 'application/json',
        'x-custom': 'test-header',
      });
      expect(result.actionResponse!.httpResponse!.statusCode).toBe(200);
    });

    it('appends original error when present', () => {
      const largeError = createLargeString('Large HTTP error message');
      const response: HttpResponse = {
        headers: { 'content-type': 'application/json' },
        statusCode: 500,
        body: 'Small body',
        error: largeError,
      };

      const result = createTruncatedHttpErrorResponse(response, 'test-request-id', 'Base error');

      expect(result.actionResponse!.httpResponse!.error).toContain('Base error');
      expect(result.actionResponse!.httpResponse!.error).toContain(
        'Original result container error:',
      );
      expect(result.actionResponse!.httpResponse!.error).toContain('Large HTTP error message');
      expect(result.actionResponse!.httpResponse!.error).toContain('[Large error truncated...]');
      expect(result.actionResponse!.httpResponse!.body).toBe('Small body');
    });

    it('handles empty body', () => {
      const response: HttpResponse = {
        headers: {},
        statusCode: 200,
        body: '',
        error: '',
      };

      const result = createTruncatedHttpErrorResponse(response, 'test-request-id', 'Test error');

      expect(result.actionResponse!.httpResponse!.body).toBe('');
      expect(result.actionResponse!.httpResponse!.error).toBe('Test error');
    });
  });

  describe('createSizeLimitExceededResponse', () => {
    describe('with PlainTextResponse', () => {
      it('creates truncated response without error field', () => {
        const largeResponse = createLargeString('Large response');
        const response: PlainTextResponse = {
          response: largeResponse,
          error: '',
        };

        const result = createSizeLimitExceededResponse(response, 'test-request-id', 2048, 1024);

        expect(result.actionResponse!.requestID).toBe('test-request-id');
        expect(result.actionResponse!.plainTextResponse!.response).toContain('Large response');
        expect(result.actionResponse!.plainTextResponse!.response).toContain(
          '[Large response truncated...]',
        );
        expect(result.actionResponse!.plainTextResponse!.error).toBe('');
      });
    });

    describe('with HttpResponse', () => {
      it('creates truncated response with error field explaining size limit', () => {
        const largeBody = createLargeString('Large HTTP body');
        const response: HttpResponse = {
          headers: { 'content-type': 'application/json' },
          statusCode: 200,
          body: largeBody,
          error: '',
        };

        const result = createSizeLimitExceededResponse(response, 'test-request-id', 2048, 1024);

        expect(result.actionResponse!.requestID).toBe('test-request-id');
        expect(result.actionResponse!.httpResponse!.body).toContain('Large HTTP body');
        expect(result.actionResponse!.httpResponse!.body).toContain(
          '[Large response body truncated...]',
        );
        expect(result.actionResponse!.httpResponse!.error).toBe(
          'Maximum allowed size exceeded. Result: 2048 bytes. Maximum allowed: 1024 bytes',
        );
      });
    });
  });

  describe('createSerializationErrorResponse', () => {
    describe('with PlainTextResponse', () => {
      it('creates error response with serialization error message', () => {
        const response: PlainTextResponse = {
          response: 'Some response',
          error: 'Some error',
        };

        const result = createSerializationErrorResponse(response, 'test-request-id');

        expect(result.actionResponse!.requestID).toBe('test-request-id');
        expect(result.actionResponse!.plainTextResponse!.response).toBe('Some response');
        expect(result.actionResponse!.plainTextResponse!.error).toContain(
          'Failed to validate response size due to serialization error',
        );
        expect(result.actionResponse!.plainTextResponse!.error).toContain(
          'Original result container error:',
        );
        expect(result.actionResponse!.plainTextResponse!.error).toContain('Some error');
      });

      it('handles empty original error', () => {
        const response: PlainTextResponse = {
          response: 'Some response',
          error: '',
        };

        const result = createSerializationErrorResponse(response, 'test-request-id');

        expect(result.actionResponse!.plainTextResponse!.error).toBe(
          'Failed to validate response size due to serialization error',
        );
      });
    });

    describe('with HttpResponse', () => {
      it('creates error response with serialization error message', () => {
        const response: HttpResponse = {
          headers: { 'content-type': 'application/json' },
          statusCode: 200,
          body: 'Some body',
          error: 'Some error',
        };

        const result = createSerializationErrorResponse(response, 'test-request-id');

        expect(result.actionResponse!.requestID).toBe('test-request-id');
        expect(result.actionResponse!.httpResponse!.body).toBe('Some body');
        expect(result.actionResponse!.httpResponse!.error).toContain(
          'Failed to validate response size due to serialization error',
        );
        expect(result.actionResponse!.httpResponse!.error).toContain(
          'Original result container error:',
        );
        expect(result.actionResponse!.httpResponse!.error).toContain('Some error');
      });

      it('handles empty original error', () => {
        const response: HttpResponse = {
          headers: {},
          statusCode: 200,
          body: 'Some body',
          error: '',
        };

        const result = createSerializationErrorResponse(response, 'test-request-id');

        expect(result.actionResponse!.httpResponse!.error).toBe(
          'Failed to validate response size due to serialization error',
        );
      });
    });
  });
});
