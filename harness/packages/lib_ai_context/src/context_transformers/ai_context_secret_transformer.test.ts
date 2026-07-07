import type { Logger } from '@gitlab-org/logging';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { SecretRedactor } from '@gitlab-org/secret-redaction';
import { OPEN_TAB_FILE } from '../test_utils/mock_data';
import type { AIContextItem } from '../ai_context_item';
import { DefaultSecretContextTransformer } from './ai_context_secret_transformer';

describe('DefaultSecretContextTransformer', () => {
  let transformer: DefaultSecretContextTransformer;
  let mockLogger: Logger;
  let mockSecretRedactor: SecretRedactor;
  let mockContextItem: AIContextItem;

  beforeEach(() => {
    mockContextItem = {
      ...OPEN_TAB_FILE,
      content: 'Wow very secret: un-redacted content.',
    };

    mockLogger = createMockLogger();

    mockSecretRedactor = createFakePartial<SecretRedactor>({
      redactSecrets: jest.fn().mockReturnValue('redacted content'),
    });

    transformer = new DefaultSecretContextTransformer(mockLogger, mockSecretRedactor);
  });

  describe('transform', () => {
    it('redacts secrets from content when enabled', async () => {
      const result = await transformer.transform(mockContextItem);

      expect(mockSecretRedactor.redactSecrets).toHaveBeenCalledWith(
        mockContextItem.content,
        mockContextItem.id,
      );
      expect(result).toEqual({
        ...mockContextItem,
        content: 'redacted content',
      });
    });

    it('returns item unchanged when content is undefined', async () => {
      const itemWithoutContent = { ...mockContextItem, content: undefined };

      const result = await transformer.transform(itemWithoutContent);

      expect(mockSecretRedactor.redactSecrets).not.toHaveBeenCalled();
      expect(result).toEqual(itemWithoutContent);
    });
  });
});
