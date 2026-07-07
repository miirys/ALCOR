import {
  IDocContext,
  StreamingCompletionResponse,
  type SuggestionOptionText,
  YamlUrlProcessor,
} from '@gitlab-org/legacy-common';
import { DesktopTreeSitterParser } from '../parser';

describe('YamlUrlProcessor', () => {
  let yamlUrlProcessor: YamlUrlProcessor;
  const treeSitter = new DesktopTreeSitterParser();

  beforeAll(async () => {
    await treeSitter.init();
  });

  beforeEach(() => {
    yamlUrlProcessor = new YamlUrlProcessor();
  });

  const yamlFileWithSchema = `
  foo: bar
  # yaml-language-server: $schema=http://localhost:8114
  key: value
`;

  const expectedResult = `
  foo: bar
  # yaml-language-server: $schema=<YOUR_URL_GOES_HERE>
  key: value
`;

  const partialPrefix = `
  foo: bar
  # yaml-language-server: `;
  const partialSuggestion = `$schema=http://localhost:8114`;
  const partialSuffix = `
  key: value`;

  const brokenYamlPrefix = `
  foo: bar
    baz: qux
    quux: corge
  # yaml-language-server: $schema=`;

  describe.each([
    ['', yamlFileWithSchema, '', expectedResult],
    [
      yamlFileWithSchema.split('\n')[1],
      yamlFileWithSchema.split('\n')[2],
      yamlFileWithSchema.split('\n')[3],
      '  # yaml-language-server: $schema=<YOUR_URL_GOES_HERE>',
    ],
    [partialPrefix, partialSuggestion, partialSuffix, '$schema=<YOUR_URL_GOES_HERE>'],
    [`${partialPrefix} $schema=`, 'http://localhost:8114', partialSuffix, '<YOUR_URL_GOES_HERE>'],
    [`${partialPrefix} $schema=http:`, '//localhost:8114', partialSuffix, '<YOUR_URL_GOES_HERE>'],
    [
      `${partialPrefix} $schema=http:`,
      `//localhost:8114
        bar: baz`,
      partialSuffix,
      `<YOUR_URL_GOES_HERE>
        bar: baz`,
    ],
    [yamlFileWithSchema, 'bar: baz', '', 'bar: baz'],
    [
      yamlFileWithSchema,
      '# yaml-language-server: $schema=https://example.com\n',
      '',
      '# yaml-language-server: $schema=<YOUR_URL_GOES_HERE>\n',
    ],
    [
      partialPrefix,
      `$schema=https://example.com
    # some irrelevant comment
    testKey: true
    # yaml-language-server: $schema=https://example.com
        `,
      partialSuffix,
      `$schema=<YOUR_URL_GOES_HERE>
    # some irrelevant comment
    testKey: true
    # yaml-language-server: $schema=<YOUR_URL_GOES_HERE>
        `,
    ],
    [brokenYamlPrefix, `https://example.com`, '', `<YOUR_URL_GOES_HERE>`],
  ])('when prefix, completion and suffix', (prefix, completion, suffix, expected) => {
    const context: IDocContext = {
      prefix,
      suffix,
      fileRelativePath: 'test.yaml',
      position: { line: 1, character: 1 },
      languageId: 'yaml',
      uri: '',
    };

    it('should filter url from completion response', async () => {
      const input: SuggestionOptionText[] = [
        {
          text: completion,
          index: 0,
          uniqueTrackingId: '123',
        },
        {
          text: `
          prop: bar`,
          index: 1,
          uniqueTrackingId: '456',
        },
      ];

      const expectedInput = [
        {
          text: expected,
          index: 0,
          uniqueTrackingId: '123',
        },
        {
          text: `
          prop: bar`,
          index: 1,
          uniqueTrackingId: '456',
        },
      ];
      const result = await yamlUrlProcessor.processCompletion(context, input);
      expect(result).toEqual(expectedInput);
    });

    it('should filter url from streaming response', async () => {
      const streamingInput: StreamingCompletionResponse = {
        id: '1',
        completion,
        done: true,
      };

      const result = await yamlUrlProcessor.processStream(context, streamingInput);

      expect(result.completion).toBe(expected);
    });
  });
});
