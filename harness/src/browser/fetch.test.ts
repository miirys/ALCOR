import fetch from 'cross-fetch';
import { createFakePartial } from '@gitlab-org/test-utils/browser';
import { Fetch } from './fetch';

jest.mock('cross-fetch');

const mockReaderRead = jest.fn().mockResolvedValue({ done: false, value: Buffer.from('test') });

const createFakeBrowserResponse = (status = 200) => {
  return createFakePartial<Response>({
    status,
    ok: true,
    body: {
      cancel: jest.fn(),
      locked: false,
      pipeThrough: jest.fn(),
      pipeTo: jest.fn(),
      tee: jest.fn(),
      getReader: jest.fn(() => ({
        read: mockReaderRead,
        cancel: jest.fn(),
        releaseLock: jest.fn(),
        closed: Promise.resolve(undefined),
      })),
    },
  });
};

describe('Browser Fetch', () => {
  const lsFetch = new Fetch();
  const mockCancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: jest.fn(),
  };

  afterEach(() => {
    (fetch as jest.Mock).mockReset();
    mockReaderRead.mockReset();
  });

  describe('getStreamingCodeSuggestions', () => {
    it('when status is not 200 throws error', async () => {
      const mockResponse = createFakeBrowserResponse(500);

      const generator = lsFetch.streamResponse(mockResponse, mockCancellationToken);
      await expect(generator.next).rejects.toThrow();
    });

    it('generator completes when done', async () => {
      const mockResponse = createFakeBrowserResponse();
      mockReaderRead.mockResolvedValue({ done: true });

      const generator = lsFetch.streamResponse(mockResponse, mockCancellationToken);
      const res = await generator.next();
      expect(res.done).toBe(true);
    });

    it('generator returns multiple chunks from the stream', async () => {
      const mockResponse = createFakeBrowserResponse();
      mockReaderRead.mockResolvedValue({ done: false, value: Buffer.from('test1') });

      const generator = lsFetch.streamResponse(mockResponse, mockCancellationToken);
      let res = await generator.next();
      expect(res.done).toBe(false);
      expect(res.value).toBe('test1');

      mockReaderRead.mockResolvedValue({ done: false, value: Buffer.from('test2') });
      res = await generator.next();
      expect(res.done).toBe(false);
      expect(res.value).toBe('test2');

      mockReaderRead.mockResolvedValue({ done: true, value: null });
      res = await generator.next();
      expect(res.done).toBe(true);
    });

    it('cancels the reader when cancellation is requested', async () => {
      const mockResponse = createFakeBrowserResponse();
      const mockReader = {
        read: mockReaderRead,
        cancel: jest.fn(),
      };
      mockReaderRead.mockResolvedValue({ done: false, value: Buffer.from('test') });
      jest.mocked(mockResponse.body?.getReader as jest.Mock).mockReturnValue(mockReader);

      const cancelToken = { isCancellationRequested: true, onCancellationRequested: jest.fn() };
      const generator = lsFetch.streamResponse(mockResponse, cancelToken);

      await generator.next();
      expect(mockReader.cancel).toHaveBeenCalled();
    });
  });
});
