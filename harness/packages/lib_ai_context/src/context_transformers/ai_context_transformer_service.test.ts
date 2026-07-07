import { createFakePartial } from '@gitlab-org/test-utils';
import { OPEN_TAB_FILE } from '../test_utils/mock_data';
import { DefaultAiContextTransformerService } from './ai_context_transformer_service';
import { AiContextTransformer } from './ai_context_transformer';

describe('DefaultAiContextTransformerService', () => {
  const mockTransformer1 = createFakePartial<AiContextTransformer>({
    transform: jest.fn(),
  });

  const mockTransformer2 = createFakePartial<AiContextTransformer>({
    transform: jest.fn(),
  });

  let transformerService: DefaultAiContextTransformerService;

  beforeEach(() => {
    transformerService = new DefaultAiContextTransformerService([
      mockTransformer1,
      mockTransformer2,
    ]);
  });

  describe('transform', () => {
    it('applies all transformers in sequence', async () => {
      const transformedByFirst = { ...OPEN_TAB_FILE, content: 'transformed by first' };
      const transformedBySecond = { ...transformedByFirst, content: 'transformed by both' };

      jest.mocked(mockTransformer1.transform).mockResolvedValue(transformedByFirst);
      jest.mocked(mockTransformer2.transform).mockResolvedValue(transformedBySecond);

      const result = await transformerService.transform(OPEN_TAB_FILE);

      expect(mockTransformer1.transform).toHaveBeenCalledWith(OPEN_TAB_FILE);
      expect(mockTransformer2.transform).toHaveBeenCalledWith(transformedByFirst);
      expect(result).toEqual(transformedBySecond);
    });

    it('handles context items without content', async () => {
      const itemWithoutContent = { ...OPEN_TAB_FILE, content: undefined };

      jest.mocked(mockTransformer1.transform).mockResolvedValue(itemWithoutContent);
      jest.mocked(mockTransformer2.transform).mockResolvedValue(itemWithoutContent);

      const result = await transformerService.transform(itemWithoutContent);

      expect(result).toEqual(itemWithoutContent);
      expect(mockTransformer1.transform).toHaveBeenCalledWith(itemWithoutContent);
      expect(mockTransformer2.transform).toHaveBeenCalledWith(itemWithoutContent);
    });
  });
});
