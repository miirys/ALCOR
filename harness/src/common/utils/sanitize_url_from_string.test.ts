/* eslint-disable no-useless-escape */
import { removeUrlsFromString } from './sanitize_url_from_string';

describe('sanitize_url_from_string', () => {
  describe('detect URL', () => {
    const testCases = [
      {
        input: String.raw`Visit our website at https://www.example.com for more information.`,
        expected: 'Visit our website at <YOUR_URL_GOES_HERE> for more information.',
        description: 'Basic HTTPS URL',
      },
      {
        input: String.raw`For HTTP, try http://legacy.example.org`,
        expected: 'For HTTP, try <YOUR_URL_GOES_HERE>',
        description: 'Basic HTTP URL',
      },
      {
        input: String.raw`For JDBC, try jdbc://legacy.example.org`,
        expected: 'For JDBC, try <YOUR_URL_GOES_HERE>',
        description: 'Other protocols',
      },
      {
        input: String.raw`For WWS, try wws://legacy.example.org`,
        expected: 'For WWS, try <YOUR_URL_GOES_HERE>',
        description: 'Websocket protocol',
      },
      {
        input: String.raw`For files protocol, try file://remotehost/f$/path/to/file`,
        expected: 'For files protocol, try <YOUR_URL_GOES_HERE>',
        description: 'Files protocol',
      },
      {
        input: String.raw`For shorthand protocol, try //legacy.example.org`,
        expected: 'For shorthand protocol, try //legacy.example.org',
        description: 'Relatvie protocol (//example.com) is not treated as a valid URL',
      },
      {
        input: String.raw`URL with path: https://api.example.com/v1/users`,
        expected: 'URL with path: <YOUR_URL_GOES_HERE>',
        description: 'URL with path',
      },
      {
        input: String.raw`URL with mixed casing: https://aPi.eXaMpLe.com/v1/users`,
        expected: 'URL with mixed casing: <YOUR_URL_GOES_HERE>',
        description: 'URL with mixed casing',
      },
      {
        input: String.raw`URL with mixed casing: https://кирилический.домен`,
        expected: 'URL with mixed casing: <YOUR_URL_GOES_HERE>',
        description: 'URL non-english characters',
      },
      {
        input: String.raw`{
          "$schema": "http://\alocalhost:8087"
        }`,
        expected: `{
          "$schema": "<YOUR_URL_GOES_HERE>"
        }`,
        description: 'URL with escaped characters \\a',
      },
      {
        input: String.raw`{
          "$schema": "http\ ://localhost:8098"
        }`,
        expected: String.raw`{
          "$schema": "<YOUR_URL_GOES_HERE>"
        }`,
        description: 'URL with escaped characters " "',
      },
      {
        input: `{
          "$schema": "http\ ://localhost:8098"
        }`,
        expected: `{
          "$schema": "<YOUR_URL_GOES_HERE>"
        }`,
        description: 'URL with escaped characters " "',
      },
      {
        input: String.raw`{
          "$schema": "https://no\t-what-you-expect.com"
        }`,
        expected: `{
          "$schema": "<YOUR_URL_GOES_HERE>"
        }`,
        description: 'URL with escaped characters \\t',
      },
      {
        input: `{
          "$schema": "https://no\t-what-you-expect.com"
        }`,
        expected: `{
          "$schema": "<YOUR_URL_GOES_HERE>"
        }`,
        description: 'Not raw string URL with escaped characters \\t',
      },
      {
        input: String.raw`{
          "$schema": "https://\not-what-you-expect.c\nom"
        }`,
        expected: `{
          "$schema": "<YOUR_URL_GOES_HERE>"
        }`,
        description: 'URL with escaped characters \\n',
      },
      {
        input: String.raw`{
          "$schema": "https://💩not-what-you-expect.com/"
        }`,
        expected: String.raw`{
          "$schema": "<YOUR_URL_GOES_HERE>"
        }`,
        description: 'URL with emojis 💩',
      },
      {
        input: String.raw`URL with query parameters: https://search.example.com/?q=test&page=1`,
        expected: 'URL with query parameters: <YOUR_URL_GOES_HERE>',
        description: 'URL with query parameters',
      },
      {
        input: String.raw`URL with fragment: https://docs.example.com/guide#section-3`,
        expected: 'URL with fragment: <YOUR_URL_GOES_HERE>',
        description: 'URL with fragment',
      },
      {
        input: String.raw`IP address URL: http://192.168.1.1/admin`,
        expected: 'IP address URL: <YOUR_URL_GOES_HERE>',
        description: 'IP address URL',
      },
      {
        input: String.raw`URL with port: https://localhost:8080/test`,
        expected: 'URL with port: <YOUR_URL_GOES_HERE>',
        description: 'URL with port',
      },
      {
        input: String.raw`Multiple URLs: Visit https://example.com or http://example.org`,
        expected: 'Multiple URLs: Visit <YOUR_URL_GOES_HERE> or <YOUR_URL_GOES_HERE>',
        description: 'Multiple URLs in one string',
      },
      {
        input: String.raw`No URL in this string\nat all`,
        expected: String.raw`No URL in this string\nat all`,
        description: 'String without URL',
      },
      {
        input: String.raw`//Commented code goes here`,
        expected: '//Commented code goes here',
        description: 'Commented code',
      },
      {
        input: String.raw`const a = foo.bar;`,
        expected: 'const a = foo.bar;',
        description: 'Member accessors should not be sanitized',
      },
      {
        input: String.raw`Partial URL: example.com`,
        expected: 'Partial URL: example.com',
        description: 'Partial URL without scheme (should not be replaced)',
      },
      {
        input: String.raw`Complex URL: https://user:pass@sub.example.com:8080/p/a/t/h?query=string#hash`,
        expected: 'Complex URL: <YOUR_URL_GOES_HERE>',
        description: 'Complex URL with all components',
      },
    ];

    describe('URL Replacement', () => {
      test.each(testCases)('$description', ({ input, expected }) => {
        const result = removeUrlsFromString(input);
        expect(result).toEqual(expected);
      });
    });
  });
});
