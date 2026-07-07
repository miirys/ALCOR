import { SuggestionOptionText } from '../../api_types';
import { IDocContext } from '../../document_transformer_service';
import { log } from '../../log';
import { StreamingCompletionResponse } from '../../notifications';
import { PostProcessor } from './post_processor_pipeline';
import { UrlSanitizationPostProcessor } from './url_sanitization/url_sanitization_post_processor';

jest.mock('../../../common/log', () => ({
  log: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('UrlSanitizationPostProcessor', () => {
  let processor: UrlSanitizationPostProcessor;

  beforeEach(() => {
    processor = new UrlSanitizationPostProcessor();
  });

  describe('when subprocessor errors', () => {
    const mockErrorProcessor: PostProcessor = {
      processCompletion: jest.fn().mockImplementation(() => {
        throw new Error('Simulated error');
      }),
      processStream: jest.fn().mockImplementation(() => {
        throw new Error('Simulated error');
      }),
    };
    const errorLanguageId = 'kotlin';

    beforeEach(() => {
      processor.addProcessor(errorLanguageId, mockErrorProcessor);
    });

    it('should return empty string when a processor errs', async () => {
      const mockContext: IDocContext = { languageId: errorLanguageId } as IDocContext;
      const mockInput: SuggestionOptionText[] = [
        {
          text: 'Some text with a URL: https://example.com',
          index: 0,
          uniqueTrackingId: '123',
        },
      ];

      const result = await processor.processCompletion(mockContext, mockInput);

      expect(result).toEqual([
        {
          text: '',
          index: 0,
          uniqueTrackingId: '123',
        },
      ]);
      expect(log.error).toHaveBeenCalledTimes(1);
    });

    it('should return empty string when a processor errs', async () => {
      const mockContext: IDocContext = { languageId: errorLanguageId } as IDocContext;
      // generate mockInput for below call
      const mockInput: StreamingCompletionResponse = {
        id: '1',
        completion: 'Some text with a URL: https://example.com',
        done: true,
      };
      const result = await processor.processStream(mockContext, mockInput);
      // generate expectation for the above call
      expect(result).toEqual({
        id: '1',
        completion: '',
        done: true,
      });
      expect(log.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('when a sub-processor is added', () => {
    const mockJsonSubProcessor: PostProcessor = {
      processCompletion: jest.fn(),
      processStream: jest.fn(),
    };
    const mockYamlSubProcessor: PostProcessor = {
      processCompletion: jest.fn(),
      processStream: jest.fn(),
    };
    const jsonLanguageId = 'json';
    const yamlLanguageId = 'yaml';

    beforeEach(() => {
      processor.addProcessor(jsonLanguageId, mockJsonSubProcessor);
      processor.addProcessor(yamlLanguageId, mockYamlSubProcessor);
    });

    const mockCompletionInput: SuggestionOptionText[] = [
      {
        text: 'Check out https://example.com for more info',
        index: 0,
        uniqueTrackingId: '123',
      },
      {
        text: 'Another option without URL',
        index: 1,
        uniqueTrackingId: '456',
      },
    ];

    const mockStreamingInput: StreamingCompletionResponse = {
      id: '1',
      completion: '',
      done: true,
    };

    describe.each([
      [yamlLanguageId, mockYamlSubProcessor],
      [jsonLanguageId, mockJsonSubProcessor],
    ])('when call in %s context', (languageId, subProcessor) => {
      it('should call the right sub processor for completion', async () => {
        const context: IDocContext = { languageId } as IDocContext;

        await processor.processCompletion(context, mockCompletionInput);

        expect(subProcessor.processCompletion).toHaveBeenCalledWith(context, mockCompletionInput);
      });

      it('should call the right sub processor for streaming', async () => {
        const context: IDocContext = { languageId } as IDocContext;

        await processor.processStream(context, mockStreamingInput);

        expect(subProcessor.processStream).toHaveBeenCalledWith(context, mockStreamingInput);
      });
    });
  });

  describe('when no sub processors are added', () => {
    describe('processStream', () => {
      it('should sanitize URLs in the streaming completion response', async () => {
        const mockContext: IDocContext = {} as IDocContext;
        const completion = 'Check out https://example.com for more info';
        const mockInput: StreamingCompletionResponse = {
          id: '1',
          completion,
          done: true,
        };

        const result = await processor.processStream(mockContext, mockInput);

        expect(result).toEqual({
          id: '1',
          completion,
          done: true,
        });
      });

      it('should handle empty completion in streaming response', async () => {
        const mockContext: IDocContext = {} as IDocContext;
        const mockInput: StreamingCompletionResponse = {
          id: '1',
          completion: '',
          done: true,
        };

        const result = await processor.processStream(mockContext, mockInput);

        expect(result).toEqual(mockInput);
      });
    });

    describe('processCompletion', () => {
      it('should sanitize URLs in the completion options', async () => {
        const mockContext: IDocContext = {} as IDocContext;
        const mockInput: SuggestionOptionText[] = [
          {
            text: 'Check out https://example.com for more info',
            index: 0,
            uniqueTrackingId: '123',
          },
          {
            text: 'Another option without URL',
            index: 1,
            uniqueTrackingId: '456',
          },
        ];

        const result = await processor.processCompletion(mockContext, mockInput);

        expect(result).toEqual(mockInput);
      });

      it('should handle empty input array', async () => {
        const mockContext: IDocContext = {} as IDocContext;
        const mockInput: SuggestionOptionText[] = [];

        const result = await processor.processCompletion(mockContext, mockInput);

        expect(result).toEqual([]);
      });

      it('should handle input with empty text', async () => {
        const mockContext: IDocContext = {} as IDocContext;
        const mockInput: SuggestionOptionText[] = [
          {
            text: '',
            index: 0,
            uniqueTrackingId: '123',
          },
        ];

        const result = await processor.processCompletion(mockContext, mockInput);

        expect(result).toEqual(mockInput);
      });
    });
  });
});
