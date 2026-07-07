/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from 'stream';
import { htmlTransformerPlugin } from './html_transformer_plugin';

describe('htmlTransformerPlugin', () => {
  let mockFastify: any;
  let mockTransformHtml: jest.Mock;
  let onSendHandler: any;

  beforeEach(() => {
    mockTransformHtml = jest.fn();
    mockFastify = {
      addHook: jest.fn(),
      log: {
        error: jest.fn(),
      },
    };
  });

  const registerPlugin = async () => {
    await htmlTransformerPlugin(mockFastify, { transformHtml: mockTransformHtml }, () => {});
    const [, handler] = mockFastify.addHook.mock.calls[0];
    onSendHandler = handler;
  };

  const createMockRequest = () => ({ url: '/test' });
  const createMockReply = (contentType?: string) => ({
    getHeader: jest.fn().mockReturnValue(contentType),
  });

  describe('plugin registration', () => {
    it('should register onSend hook', async () => {
      await registerPlugin();

      expect(mockFastify.addHook).toHaveBeenCalledWith('onSend', expect.any(Function));
    });
  });

  describe('content-type filtering', () => {
    beforeEach(async () => {
      await registerPlugin();
    });

    it('should process text/html content', async () => {
      const request = createMockRequest();
      const reply = createMockReply('text/html; charset=utf-8');
      const payload = '<html><body>test</body></html>';
      mockTransformHtml.mockResolvedValue('<html><body>transformed</body></html>');

      const result = await onSendHandler(request, reply, payload);

      expect(mockTransformHtml).toHaveBeenCalledWith(payload);
      expect(result).toBe('<html><body>transformed</body></html>');
    });

    it('should skip non-HTML content types', async () => {
      const request = createMockRequest();
      const reply = createMockReply('application/json');
      const payload = '{"test": "data"}';

      const result = await onSendHandler(request, reply, payload);

      expect(mockTransformHtml).not.toHaveBeenCalled();
      expect(result).toBe(payload);
    });

    it('should skip when no content-type header', async () => {
      const request = createMockRequest();
      const reply = createMockReply(undefined);
      const payload = '<html><body>test</body></html>';

      const result = await onSendHandler(request, reply, payload);

      expect(mockTransformHtml).not.toHaveBeenCalled();
      expect(result).toBe(payload);
    });

    it('should skip when content-type is a number', async () => {
      const request = createMockRequest();
      const reply = createMockReply(200 as any);
      const payload = '<html><body>test</body></html>';

      const result = await onSendHandler(request, reply, payload);

      expect(mockTransformHtml).not.toHaveBeenCalled();
      expect(result).toBe(payload);
    });
  });

  describe('payload transformation', () => {
    beforeEach(async () => {
      await registerPlugin();
    });

    describe('string payloads', () => {
      it('should transform string HTML payload', async () => {
        const request = createMockRequest();
        const reply = createMockReply('text/html');
        const payload = '<html><body>original</body></html>';
        mockTransformHtml.mockResolvedValue('<html><body>transformed</body></html>');

        const result = await onSendHandler(request, reply, payload);

        expect(mockTransformHtml).toHaveBeenCalledWith(payload);
        expect(result).toBe('<html><body>transformed</body></html>');
      });

      it('should handle transformation errors for strings', async () => {
        const request = createMockRequest();
        const reply = createMockReply('text/html');
        const payload = '<html><body>test</body></html>';
        const error = new Error('Transform failed');
        mockTransformHtml.mockRejectedValue(error);

        const result = await onSendHandler(request, reply, payload);

        expect(mockFastify.log.error).toHaveBeenCalledWith(
          { error, url: '/test' },
          'String HTML transformation failed',
        );
        expect(result).toBe(payload);
      });
    });

    describe('Buffer payloads', () => {
      it('should transform Buffer HTML payload', async () => {
        const request = createMockRequest();
        const reply = createMockReply('text/html');
        const payload = Buffer.from('<html><body>original</body></html>', 'utf-8');
        mockTransformHtml.mockResolvedValue('<html><body>transformed</body></html>');

        const result = await onSendHandler(request, reply, payload);

        expect(mockTransformHtml).toHaveBeenCalledWith('<html><body>original</body></html>');
        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.toString('utf-8')).toBe('<html><body>transformed</body></html>');
      });

      it('should handle transformation errors for Buffers', async () => {
        const request = createMockRequest();
        const reply = createMockReply('text/html');
        const payload = Buffer.from('<html><body>test</body></html>', 'utf-8');
        const error = new Error('Transform failed');
        mockTransformHtml.mockRejectedValue(error);

        const result = await onSendHandler(request, reply, payload);

        expect(mockFastify.log.error).toHaveBeenCalledWith(
          { error, url: '/test' },
          'Buffer HTML transformation failed',
        );
        expect(result).toBe(payload);
      });
    });

    describe('stream payloads', () => {
      it('should transform Readable stream HTML payload', async () => {
        const request = createMockRequest();
        const reply = createMockReply('text/html');
        const streamData = '<html><body>original</body></html>';
        const payload = Readable.from([streamData]);
        mockTransformHtml.mockResolvedValue('<html><body>transformed</body></html>');

        const result = await onSendHandler(request, reply, payload);

        expect(mockTransformHtml).toHaveBeenCalledWith(streamData);
        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.toString('utf-8')).toBe('<html><body>transformed</body></html>');
      });

      it('should handle stream read errors', async () => {
        const request = createMockRequest();
        const reply = createMockReply('text/html');
        const payload = new Readable({
          read() {
            this.emit('error', new Error('Stream read failed'));
          },
        });

        const result = await onSendHandler(request, reply, payload);

        expect(mockFastify.log.error).toHaveBeenCalledWith(
          { error: expect.any(Error), url: '/test' },
          'Stream HTML transformation failed',
        );
        expect(result).toBe(payload);
      });

      it('should handle transformation errors for streams', async () => {
        const request = createMockRequest();
        const reply = createMockReply('text/html');
        const streamData = '<html><body>test</body></html>';
        const payload = Readable.from([streamData]);
        const transformError = new Error('Transform failed');
        mockTransformHtml.mockRejectedValue(transformError);

        const result = await onSendHandler(request, reply, payload);

        expect(mockFastify.log.error).toHaveBeenCalledWith(
          { error: transformError, url: '/test' },
          'Stream HTML transformation failed',
        );
        expect(result).toBe(payload);
      });
    });

    describe('other payload types', () => {
      it('should return payload unchanged for unsupported types', async () => {
        const request = createMockRequest();
        const reply = createMockReply('text/html');
        const payload = { some: 'object' };

        const result = await onSendHandler(request, reply, payload);

        expect(mockTransformHtml).not.toHaveBeenCalled();
        expect(result).toBe(payload);
      });
    });
  });
});

describe('readStream helper function', () => {
  it('should read stream data successfully', async () => {
    const streamData = '<html><body>test content</body></html>';
    const stream = Readable.from([streamData]);

    // Access readStream through the plugin to test it
    const mockFastify = {
      addHook: jest.fn(),
      log: { error: jest.fn() },
    };

    await htmlTransformerPlugin(
      mockFastify as any,
      {
        transformHtml: async (html) => html,
      },
      () => {},
    );

    const [, onSendHandler] = mockFastify.addHook.mock.calls[0];
    const request = { url: '/test' };
    const reply = { getHeader: jest.fn().mockReturnValue('text/html') };

    const result = await onSendHandler(request, reply, stream);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString('utf-8')).toBe(streamData);
  });

  it('should handle stream with multiple chunks', async () => {
    const chunk1 = '<html><body>';
    const chunk2 = 'test content';
    const chunk3 = '</body></html>';
    const stream = Readable.from([chunk1, chunk2, chunk3]);

    const mockFastify = {
      addHook: jest.fn(),
      log: { error: jest.fn() },
    };

    await htmlTransformerPlugin(
      mockFastify as any,
      {
        transformHtml: async (html) => html,
      },
      () => {},
    );

    const [, onSendHandler] = mockFastify.addHook.mock.calls[0];
    const request = { url: '/test' };
    const reply = { getHeader: jest.fn().mockReturnValue('text/html') };

    const result = await onSendHandler(request, reply, stream);

    expect(result.toString('utf-8')).toBe(chunk1 + chunk2 + chunk3);
  });

  it('should handle empty stream', async () => {
    const stream = Readable.from([]);

    const mockFastify = {
      addHook: jest.fn(),
      log: { error: jest.fn() },
    };

    await htmlTransformerPlugin(
      mockFastify as any,
      {
        transformHtml: async (html) => html,
      },
      () => {},
    );

    const [, onSendHandler] = mockFastify.addHook.mock.calls[0];
    const request = { url: '/test' };
    const reply = { getHeader: jest.fn().mockReturnValue('text/html') };

    const result = await onSendHandler(request, reply, stream);

    expect(result.toString('utf-8')).toBe('');
  });
});
