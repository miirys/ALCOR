import { InlineCompletionContext, SelectedCompletionInfo } from 'vscode-languageserver-protocol';
import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  shouldRejectCompletionWithSelectedCompletionTextMismatch,
  isAtOrNearEndOfLine,
} from './suggestion_filter';

describe('suggestion/suggestion_filter', () => {
  describe('isAtOrNearEndOfLine', () => {
    describe('end of line or only special characters remaining', () => {
      it.each`
        name                                           | suffix                           | expected
        ${'is at end of line'}                         | ${'\nconsole.log("hello")'}      | ${true}
        ${'is at end of file'}                         | ${''}                            | ${true}
        ${'only has whitespace after current line'}    | ${'   '}                         | ${true}
        ${'only has special chars after current line'} | ${'");\nconsole.log("hello")\n'} | ${true}
        ${'precedes a unix line ending'}               | ${'\nconsole.log("hello")'}      | ${true}
        ${'precedes a windows line ending'}            | ${'\r\nconsole.log("hello")'}    | ${true}
        ${'is mid-word'}                               | ${'ole.log("hello")\n'}          | ${false}
        ${'precedes an escaped line ending'}           | ${'\\n'}                         | ${false}
      `(
        'expect isAtOrNearEndOfLine to be $expected when cursor $name',
        async ({ suffix, expected }) => {
          expect(isAtOrNearEndOfLine(suffix)).toBe(expected);
        },
      );
    });
  });

  describe('shouldRejectCompletionWithSelectedCompletionTextMismatch', () => {
    let documentMock: TextDocument;

    beforeEach(() => {
      documentMock = createFakePartial<TextDocument>({
        getText: jest.fn(),
      });
    });

    describe('when completion context is invalid', () => {
      it.each`
        context
        ${{ selectedCompletionInfo: null }}
        ${{}}
      `('returns false', ({ context }) => {
        expect(
          shouldRejectCompletionWithSelectedCompletionTextMismatch(context, documentMock),
        ).toBe(false);
      });
    });

    describe('when completion context is valid', () => {
      let completionContext: InlineCompletionContext;

      beforeEach(() => {
        completionContext = createFakePartial<InlineCompletionContext>({
          selectedCompletionInfo: createFakePartial<SelectedCompletionInfo>({}),
        });
      });

      describe('when document is undefined', () => {
        it('returns false', () => {
          expect(
            shouldRejectCompletionWithSelectedCompletionTextMismatch(completionContext, undefined),
          ).toBe(false);
        });
      });

      describe('when document is defined', () => {
        it.each`
          documentText | completionText | result
          ${'console'} | ${'console'}   | ${false}
          ${'const'}   | ${'console'}   | ${true}
        `(
          'returns $result if document text is $documentText and completionText is $completionText',
          ({ documentText, completionText, result }) => {
            const range = createFakePartial<Range>({});

            completionContext = createFakePartial<InlineCompletionContext>({
              selectedCompletionInfo: createFakePartial<SelectedCompletionInfo>({
                text: completionText,
                range,
              }),
            });

            jest.mocked(documentMock.getText).mockReturnValueOnce(documentText);

            expect(
              shouldRejectCompletionWithSelectedCompletionTextMismatch(
                completionContext,
                documentMock,
              ),
            ).toBe(result);
            expect(documentMock.getText).toHaveBeenCalledWith(range);
          },
        );
      });
    });
  });
});
