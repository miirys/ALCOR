/* eslint-disable max-classes-per-file */
export class RpcValidationError extends Error {
  details: string;

  constructor(message: string, details: string) {
    super(message);
    this.name = 'RpcValidationError';
    this.details = details;
  }
}

export class RpcParamsValidationError extends RpcValidationError {
  constructor(methodName: string, details: string) {
    super(`Parameter validation failed for ${methodName}`, details);
    this.name = 'RpcParamsValidationError';
  }
}

export class RpcResponseValidationError extends RpcValidationError {
  constructor(methodName: string, details: string) {
    super(`Response validation failed for ${methodName}`, details);
    this.name = 'RpcResponseValidationError';
  }
}
