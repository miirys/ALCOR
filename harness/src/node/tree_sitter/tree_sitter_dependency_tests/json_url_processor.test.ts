import {
  IDocContext,
  StreamingCompletionResponse,
  type SuggestionOptionText,
  JsonUrlProcessor,
  URL_PLACEHOLDER,
} from '@gitlab-org/legacy-common';
import { DesktopTreeSitterParser } from '../parser';

describe('JsonUrlProcessor', () => {
  let jsonUrlProcessor: JsonUrlProcessor;
  const treeSitter = new DesktopTreeSitterParser();

  beforeAll(async () => {
    await treeSitter.init();
  });

  beforeEach(() => {
    jsonUrlProcessor = new JsonUrlProcessor(treeSitter);
  });

  const jsonFileWithSanitizedUrl = `{
  "foo": "bar",
  "$schema": "${URL_PLACEHOLDER}"
  }`;

  const jsonFileWithSchemaField = `{
  "foo": "bar",
  "$schema": "http://json-schema.org/draft-07/schema#"
  }`;

  const jsonFileWithEscapedCharacters = String.raw`{
  "foo": "bar",
  "$schema": "http\ ://localhost:8098"
  }`;

  const jsonFileWithEmojis = String.raw`{
  "foo": "bar",
  "$schema": "https://💩not-what-you-expect.com/"
  }`;

  const packageJsonPrefix = `{
  "name": "@gitlab/cluster-client",
  "repository": "https://gitlab.com/gitlab-org/cluster-integration/javascript-client.git",
  "sideEffects": false,
  "version": "2.2.0",
  "description": "A JavaScript client for Kubernetes for use in the GitLab frontend.",
  "license": "MIT",
  "main": "dist/src/index.js",
  // add $schema field here`;
  const packageJsonSuggestion = ` to the package.json
  "$schema": "https://json.schemastore.org/package.json",`;
  const packageJsonSuffix = `"scripts": {},
  "dependencies": {
    "axios": "^0.24.0",
    "core-js": "^3.29.1",
    "mitt": "^3.0.1"
  },
  "devDependencies": {
    "@types/jest": "^29.5.3",
    "jest": "^29.6.2",
    "prettier": "^3.0.1",
    "ts-jest": "^29.1.1",
    "tsc": "^2.0.4",
    "typescript": "^4.9.4"
  },
  "files": [
    "src/**/*.ts",
    "dist/**/*.js",
    "client/src/*.ts"
  ]
}
`;
  const packageJsonExpected = ` to the package.json
  "$schema": "${URL_PLACEHOLDER}",`;

  describe.each([
    ['', jsonFileWithSchemaField, '', jsonFileWithSanitizedUrl],
    ['', jsonFileWithEscapedCharacters, '', jsonFileWithSanitizedUrl],
    ['', jsonFileWithEmojis, '', jsonFileWithSanitizedUrl],
    [
      `{
  "foo": "bar",
  "$schema":`,
      ' "http://json-schema.org/draft-07/schema#"',
      '\n}',
      ` "${URL_PLACEHOLDER}"`,
    ],
    [
      `{
  "foo": "bar",
  "$sch`,
      'ema": "http://json-schema.org/draft-07/schema#"',
      '\n}',
      `ema": "${URL_PLACEHOLDER}"`,
    ],
    [packageJsonPrefix, packageJsonSuggestion, packageJsonSuffix, packageJsonExpected],
  ])('when prefix, completion and suffix', (prefix, completion, suffix, expected) => {
    const context: IDocContext = {
      prefix,
      suffix,
      fileRelativePath: 'test.json',
      position: { line: 1, character: 1 },
      languageId: 'json',
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
      const result = await jsonUrlProcessor.processCompletion(context, input);
      expect(result).toEqual(expectedInput);
    });

    it('should filter url from streaming response', async () => {
      const streamingInput: StreamingCompletionResponse = {
        id: '1',
        completion,
        done: true,
      };

      const result = await jsonUrlProcessor.processStream(context, streamingInput);

      expect(result.completion).toBe(expected);
    });
  });
});
