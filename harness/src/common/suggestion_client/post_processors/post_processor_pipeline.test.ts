import { createFakePartial } from '@gitlab-org/test-utils';
import { IDocContext } from '../../document_transformer_service';
import { SuggestionOptionText } from '../../api_types';
import { TreeSitterParser } from '../../tree_sitter';
import { StreamingCompletionResponse } from '../../notifications';
import { log } from '../../log';
import { PostProcessor } from './post_processor_pipeline'; // Update the import path as needed
import { DefaultPostProcessorPipeline } from './default_post_processor_pipeline';

jest.mock('../../log');

describe('PostProcessorPipeline', () => {
  let pipeline: DefaultPostProcessorPipeline;
  let mockContext: IDocContext;

  const treeSitter = createFakePartial<TreeSitterParser>({});

  beforeEach(() => {
    pipeline = new DefaultPostProcessorPipeline(treeSitter);
    mockContext = {} as IDocContext;
  });

  test('should return input unchanged when no processors are added', async () => {
    const streamInput: StreamingCompletionResponse = { id: '1', completion: 'test', done: false };
    const result = await pipeline.run({
      documentContext: mockContext,
      input: streamInput,
    });
    expect(result).toEqual(streamInput);
  });

  test('should process stream input correctly', async () => {
    class TestStreamProcessor extends PostProcessor {
      async processStream(
        _context: IDocContext,
        input: StreamingCompletionResponse,
      ): Promise<StreamingCompletionResponse> {
        return { ...input, completion: `${input.completion} processed` };
      }

      async processCompletion(
        _context: IDocContext,
        input: SuggestionOptionText[],
      ): Promise<SuggestionOptionText[]> {
        return input;
      }
    }

    pipeline.addProcessor(new TestStreamProcessor());

    const streamInput: StreamingCompletionResponse = { id: '1', completion: 'test', done: false };
    const result = await pipeline.run({
      documentContext: mockContext,
      input: streamInput,
    });

    expect(result).toEqual({ id: '1', completion: 'test processed', done: false });
  });

  test('should process completion input correctly', async () => {
    class TestCompletionProcessor extends PostProcessor {
      async processStream(
        _context: IDocContext,
        input: StreamingCompletionResponse,
      ): Promise<StreamingCompletionResponse> {
        return input;
      }

      async processCompletion(
        _context: IDocContext,
        input: SuggestionOptionText[],
      ): Promise<SuggestionOptionText[]> {
        return input.map((option) => ({ ...option, text: `${option.text} processed` }));
      }
    }

    pipeline.addProcessor(new TestCompletionProcessor());

    const completionInput: SuggestionOptionText[] = [{ text: 'option1', uniqueTrackingId: '1' }];
    const result = await pipeline.run({
      documentContext: mockContext,
      input: completionInput,
    });

    expect(result).toEqual([{ text: 'option1 processed', uniqueTrackingId: '1' }]);
  });

  test('should chain multiple processors correctly for stream input', async () => {
    class Processor1 extends PostProcessor {
      async processStream(
        _context: IDocContext,
        input: StreamingCompletionResponse,
      ): Promise<StreamingCompletionResponse> {
        return { ...input, completion: `${input.completion} [1]` };
      }

      async processCompletion(
        _context: IDocContext,
        input: SuggestionOptionText[],
      ): Promise<SuggestionOptionText[]> {
        return input;
      }
    }

    class Processor2 extends PostProcessor {
      async processStream(
        _context: IDocContext,
        input: StreamingCompletionResponse,
      ): Promise<StreamingCompletionResponse> {
        return { ...input, completion: `${input.completion} [2]` };
      }

      async processCompletion(
        _context: IDocContext,
        input: SuggestionOptionText[],
      ): Promise<SuggestionOptionText[]> {
        return input;
      }
    }

    pipeline.addProcessor(new Processor1());
    pipeline.addProcessor(new Processor2());

    const streamInput: StreamingCompletionResponse = { id: '1', completion: 'test', done: false };
    const result = await pipeline.run({
      documentContext: mockContext,
      input: streamInput,
    });

    expect(result).toEqual({ id: '1', completion: 'test [1] [2]', done: false });
  });

  test('should chain multiple processors correctly for completion input', async () => {
    class Processor1 extends PostProcessor {
      async processStream(
        _context: IDocContext,
        input: StreamingCompletionResponse,
      ): Promise<StreamingCompletionResponse> {
        return input;
      }

      async processCompletion(
        _context: IDocContext,
        input: SuggestionOptionText[],
      ): Promise<SuggestionOptionText[]> {
        return input.map((option) => ({ ...option, text: `${option.text} [1]` }));
      }
    }

    class Processor2 extends PostProcessor {
      async processStream(
        _context: IDocContext,
        input: StreamingCompletionResponse,
      ): Promise<StreamingCompletionResponse> {
        return input;
      }

      async processCompletion(
        _context: IDocContext,
        input: SuggestionOptionText[],
      ): Promise<SuggestionOptionText[]> {
        return input.map((option) => ({ ...option, text: `${option.text} [2]` }));
      }
    }

    pipeline.addProcessor(new Processor1());
    pipeline.addProcessor(new Processor2());

    const completionInput: SuggestionOptionText[] = [{ text: 'option1', uniqueTrackingId: '1' }];
    const result = await pipeline.run({
      documentContext: mockContext,
      input: completionInput,
    });

    expect(result).toEqual([{ text: 'option1 [1] [2]', uniqueTrackingId: '1' }]);
  });

  test('should throw an error for unexpected type', async () => {
    class TestProcessor extends PostProcessor {
      async processStream(
        _context: IDocContext,
        input: StreamingCompletionResponse,
      ): Promise<StreamingCompletionResponse> {
        return input;
      }

      async processCompletion(
        _context: IDocContext,
        input: SuggestionOptionText[],
      ): Promise<SuggestionOptionText[]> {
        return input;
      }
    }
    pipeline.addProcessor(new TestProcessor());
    const invalidInput = { invalid: 'input' };
    await pipeline.run({
      documentContext: mockContext,
      input: invalidInput as unknown as StreamingCompletionResponse,
    });
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching('Unknown input type'));
  });
});
