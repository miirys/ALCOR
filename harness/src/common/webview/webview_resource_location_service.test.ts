import { WebviewId } from '@gitlab-org/webview-plugin';
import { WebviewLocationService, WebviewUriProvider } from './webview_resource_location_service';

describe('WebviewLocationService', () => {
  let service: WebviewLocationService;
  let mockProvider1: WebviewUriProvider;
  let mockProvider2: WebviewUriProvider;
  let mockProvider3: WebviewUriProvider;

  const TEST_WEBVIEW_ID = 'test-webview-id' as WebviewId;
  const TEST_URI_1 = 'https://test1.example.com';
  const TEST_URI_2 = 'https://test2.example.com';
  const TEST_URI_3 = 'https://test3.example.com';

  beforeEach(() => {
    service = new WebviewLocationService();

    mockProvider1 = {
      getUri: jest.fn().mockReturnValue(TEST_URI_1),
    };

    mockProvider2 = {
      getUri: jest.fn().mockReturnValue(TEST_URI_2),
    };

    mockProvider3 = {
      getUri: jest.fn().mockReturnValue(TEST_URI_3),
    };
  });

  describe('resolveUris', () => {
    it('should return empty array when no providers are registered', () => {
      const result = service.resolveUris(TEST_WEBVIEW_ID);

      expect(result).toEqual([]);
    });

    it('should return URIs from all providers that return values', () => {
      service.register(mockProvider1);
      service.register(mockProvider2);

      const result = service.resolveUris(TEST_WEBVIEW_ID);

      expect(result).toEqual([TEST_URI_1, TEST_URI_2]);
    });

    it('should filter out providers that return undefined', () => {
      jest.mocked(mockProvider2.getUri).mockReturnValue(undefined);

      service.register(mockProvider1);
      service.register(mockProvider2);
      service.register(mockProvider3);

      const result = service.resolveUris(TEST_WEBVIEW_ID);

      expect(result).toEqual([TEST_URI_1, TEST_URI_3]);
      expect(mockProvider1.getUri).toHaveBeenCalledWith(TEST_WEBVIEW_ID);
      expect(mockProvider2.getUri).toHaveBeenCalledWith(TEST_WEBVIEW_ID);
      expect(mockProvider3.getUri).toHaveBeenCalledWith(TEST_WEBVIEW_ID);
    });

    it('should return empty array when all providers return undefined', () => {
      jest.mocked(mockProvider1.getUri).mockReturnValue(undefined);
      jest.mocked(mockProvider2.getUri).mockReturnValue(undefined);

      service.register(mockProvider1);
      service.register(mockProvider2);

      const result = service.resolveUris(TEST_WEBVIEW_ID);

      expect(result).toEqual([]);
    });
  });
});
