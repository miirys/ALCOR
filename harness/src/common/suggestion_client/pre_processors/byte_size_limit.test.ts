import { AIContextItem } from '@gitlab-org/ai-context';
import { getByteSize } from '@gitlab-org/core';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { IDocContext } from '../../document_transformer_service';
import {
  ByteSizeLimitPreProcessor,
  CODE_SUGGESTIONS_REQUEST_BYTE_SIZE_LIMIT,
} from './byte_size_limit';

jest.mock('../../log', () => ({
  log: {
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ByteSizeLimitPreProcessor', () => {
  let processor: ByteSizeLimitPreProcessor;
  let mockContext: IDocContext;
  let mockContextItem: AIContextItem;
  let mockLogger: Logger;
  beforeEach(() => {
    mockContext = createFakePartial<IDocContext>({
      prefix: 'prefix',
      suffix: 'suffix',
    });

    mockContextItem = createFakePartial<AIContextItem>({
      id: 'test-id',
      category: 'file',
      metadata: {
        title: 'test.ts',
        enabled: true,
        icon: 'document',
        secondaryText: 'test.ts',
        subType: 'open_tab',
        subTypeLabel: 'Project file',
      },
    });

    mockLogger = new TestLogger();

    processor = new ByteSizeLimitPreProcessor(mockLogger);
  });

  it('should return all items when total size is within limit', async () => {
    const input = [
      { ...mockContextItem, content: 'a'.repeat(10000) },
      { ...mockContextItem, id: 'test-id-2', content: 'b'.repeat(10000) },
    ];

    const result = await processor.process({ documentContext: mockContext, aiContextItems: input });
    expect(result).toEqual({
      preProcessorItems: { documentContext: mockContext, aiContextItems: input },
    });
  });

  it('should filter out items that exceed the byte size limit', async () => {
    const input = [
      { ...mockContextItem, content: 'a'.repeat(20000) },
      { ...mockContextItem, id: 'test-id-2', content: 'b'.repeat(40000) },
      { ...mockContextItem, id: 'test-id-3', content: 'c'.repeat(10000) },
    ];

    const result = await processor.process({ documentContext: mockContext, aiContextItems: input });
    expect(result.preProcessorItems.aiContextItems.length).toBe(2);
    expect(result.preProcessorItems.aiContextItems[0]).toEqual(input[0]);
    // Second item should be trimmed
    expect(result.preProcessorItems.aiContextItems[1].content?.length).toBeLessThan(
      input[1].content!.length,
    );
  });

  it('should handle items without content', async () => {
    const input = [{ ...mockContextItem }, { ...mockContextItem, id: 'test-id-2' }];

    const result = await processor.process({ documentContext: mockContext, aiContextItems: input });
    expect(result.preProcessorItems.aiContextItems).toEqual(input);
  });

  it('should handle empty input array', async () => {
    const result = await processor.process({ documentContext: mockContext, aiContextItems: [] });
    expect(result.preProcessorItems.aiContextItems).toEqual([]);
  });

  it('should consider document context size in total size calculation', async () => {
    const largeContext = createFakePartial<IDocContext>({
      prefix: 'a'.repeat(40000),
      suffix: 'b'.repeat(5000),
    });
    const items = [
      { ...mockContextItem, content: 'c'.repeat(10000) },
      { ...mockContextItem, id: 'test-id-2', content: 'd'.repeat(10000) },
    ];

    const result = await processor.process({
      documentContext: largeContext,
      aiContextItems: items,
    });
    expect(result.preProcessorItems.aiContextItems.length).toBe(1);
  });

  it('should not include item if there is no room for it', async () => {
    const largeContext = createFakePartial<IDocContext>({
      prefix: 'a'.repeat(40000),
      suffix: 'b'.repeat(10000),
    });

    const input = [{ ...mockContextItem, content: 'a'.repeat(5000) }];
    const result = await processor.process({
      documentContext: largeContext,
      aiContextItems: input,
    });
    expect(result.preProcessorItems.aiContextItems.length).toBe(0);
  });

  it('should truncate document content when it exceeds byte size limit', async () => {
    const largeContext = createFakePartial<IDocContext>({
      prefix: 'a'.repeat(30000),
      suffix: 'b'.repeat(30000),
    });

    const result = await processor.process({
      documentContext: largeContext,
      aiContextItems: [mockContextItem],
    });

    expect(result.preProcessorItems.aiContextItems).toEqual([]);
    expect(result.preProcessorItems.documentContext.prefix).toBe(largeContext.prefix);
    expect(result.preProcessorItems.documentContext.suffix.length).toBeLessThan(
      largeContext.suffix.length,
    );
    expect(
      getByteSize(
        result.preProcessorItems.documentContext.prefix +
          result.preProcessorItems.documentContext.suffix,
      ),
    ).toBeLessThanOrEqual(CODE_SUGGESTIONS_REQUEST_BYTE_SIZE_LIMIT);
  });

  it('should trim content of the last fitting item', async () => {
    const input = [
      { ...mockContextItem, content: 'a'.repeat(20000) },
      { ...mockContextItem, id: 'test-id-2', content: 'b'.repeat(40000) },
    ];

    const result = await processor.process({ documentContext: mockContext, aiContextItems: input });
    expect(result.preProcessorItems.aiContextItems.length).toBe(2);
    expect(result.preProcessorItems.aiContextItems[0]).toEqual(input[0]);
    const expectedLength =
      CODE_SUGGESTIONS_REQUEST_BYTE_SIZE_LIMIT -
      Buffer.from(`${mockContext.prefix}${mockContext.suffix}${input[0].content}`).length;
    expect(result.preProcessorItems.aiContextItems[1].content?.length).toBe(
      expectedLength > 0 ? expectedLength : 0,
    );
  });
});
