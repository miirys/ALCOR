import { Logger } from '@gitlab-org/logging';
import { MessageValidator } from '@gitlab-org/webview-transport';
import { withJsonRpcMessageValidation } from './with_json_rpc_message_validation';

describe('withJsonRpcMessageValidation', () => {
  const mockAction = jest.fn();
  const mockLogger: Logger = { error: jest.fn() } as unknown as Logger;
  const mockValidator = jest.fn() as jest.Mock<boolean, [unknown]> & MessageValidator<unknown>;

  it('should not execute the action if validation fails', () => {
    mockValidator.mockReturnValue(false);
    const messageHandler = withJsonRpcMessageValidation(mockValidator, mockLogger, mockAction);

    const testMessage = { type: 'test', payload: 'data' };
    messageHandler(testMessage);

    expect(mockValidator).toHaveBeenCalledWith(testMessage);
    expect(mockAction).not.toHaveBeenCalled();
  });

  it('should log an error if validation fails', () => {
    mockValidator.mockReturnValue(false);
    const messageHandler = withJsonRpcMessageValidation(mockValidator, mockLogger, mockAction);

    const testMessage = { type: 'test', payload: 'data' };
    messageHandler(testMessage);

    expect(mockLogger.error).toHaveBeenCalledWith(
      `Invalid JSON-RPC message: ${JSON.stringify(testMessage)}`,
    );
  });

  it('should execute the action if validation succeeds', () => {
    mockValidator.mockReturnValue(true);
    const messageHandler = withJsonRpcMessageValidation(mockValidator, mockLogger, mockAction);

    const testMessage = { type: 'test', payload: 'data' };
    messageHandler(testMessage);

    expect(mockAction).toHaveBeenCalledWith(testMessage);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
