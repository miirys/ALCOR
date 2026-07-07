import { truncateToByteLimit } from '@gitlab-org/core';
import { ClientEvent, HttpResponse, PlainTextResponse } from '@gitlab-org/duo-workflow-service';

export function isPlaintextResponse(
  response: HttpResponse | PlainTextResponse,
): response is PlainTextResponse {
  return Object.hasOwn(response, 'response');
}

export function createTruncatedPlainTextResponse(
  response: PlainTextResponse,
  requestID: string,
): ClientEvent {
  const truncatedResponse = response.response
    ? truncateToByteLimit(response.response, 1024, { suffix: '[Large response truncated...]' })
    : '';

  return {
    actionResponse: {
      requestID,
      plainTextResponse: {
        response: truncatedResponse,
        error: '',
      },
    },
  };
}

export function createTruncatedPlainTextErrorResponse(
  result: PlainTextResponse,
  requestID: string,
  errorMessage: string,
): ClientEvent {
  const truncatedResponse = result.response
    ? truncateToByteLimit(result.response, 1024, { suffix: '[Large response truncated...]' })
    : '';

  let finalErrorMessage = errorMessage;
  if (result.error) {
    finalErrorMessage += `\nOriginal result container error:\n${truncateToByteLimit(result.error, 1024, { suffix: '[Large error truncated...]' })}`;
  }

  return {
    actionResponse: {
      requestID,
      plainTextResponse: {
        response: truncatedResponse,
        error: finalErrorMessage,
      },
    },
  };
}

export function createTruncatedHttpErrorResponse(
  result: HttpResponse,
  requestID: string,
  errorMessage: string,
): ClientEvent {
  let finalErrorMessage = errorMessage;
  if (result.error) {
    finalErrorMessage += `\nOriginal result container error:\n${truncateToByteLimit(result.error, 1024, { suffix: '[Large error truncated...]' })}`;
  }

  const truncatedBody = result.body
    ? truncateToByteLimit(result.body, 1024, { suffix: '[Large response body truncated...]' })
    : '';

  return {
    actionResponse: {
      requestID,
      httpResponse: {
        headers: result.headers,
        statusCode: result.statusCode,
        body: truncatedBody,
        error: finalErrorMessage,
      },
    },
  };
}

/**
 * Creates a truncated response when size limit is exceeded.
 * PlainTextResponse: no error field (truncation indicated in suffix only)
 * HttpResponse: includes error field explaining the size limit
 */
export function createSizeLimitExceededResponse(
  response: PlainTextResponse | HttpResponse,
  requestID: string,
  responseSize: number,
  maxSize: number,
): ClientEvent {
  if (isPlaintextResponse(response)) {
    return createTruncatedPlainTextResponse(response, requestID);
  }
  return createTruncatedHttpErrorResponse(
    response,
    requestID,
    `Maximum allowed size exceeded. Result: ${responseSize} bytes. Maximum allowed: ${maxSize} bytes`,
  );
}

/**
 * Creates a truncated response when serialization fails.
 * Both response types include error field explaining the serialization failure.
 */
export function createSerializationErrorResponse(
  response: PlainTextResponse | HttpResponse,
  requestID: string,
): ClientEvent {
  const errorMessage = 'Failed to validate response size due to serialization error';

  if (isPlaintextResponse(response)) {
    return createTruncatedPlainTextErrorResponse(response, requestID, errorMessage);
  }
  return createTruncatedHttpErrorResponse(response, requestID, errorMessage);
}
