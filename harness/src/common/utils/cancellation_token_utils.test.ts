import { CancellationToken } from 'vscode-languageserver';
import { toAbortSignal } from './cancellation_token_utils';

describe('createAbortSignalFromCancellationToken', () => {
  it('returns an aborted signal when cancellation token is already cancelled', () => {
    const mockToken: CancellationToken = {
      isCancellationRequested: true,
      onCancellationRequested: jest.fn(),
    };

    const signal = toAbortSignal(mockToken);

    expect(signal.aborted).toBe(true);
  });

  it('returns a signal that aborts when cancellation token is cancelled later', () => {
    const mockDisposable = { dispose: jest.fn() };
    const mockToken: CancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: jest.fn().mockReturnValue(mockDisposable),
    };

    const signal = toAbortSignal(mockToken);

    expect(signal.aborted).toBe(false);

    const callback = (mockToken.onCancellationRequested as jest.Mock).mock.calls[0][0];
    callback();

    expect(signal.aborted).toBe(true);
  });
});
