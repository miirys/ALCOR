import { isSmallFile } from './small_files';

describe('isSmallFile', () => {
  it.each`
    description              | textContent                                                                     | commentLines | isSmall
    ${'less than 5 lines'}   | ${`line_1 \n line_2 \n line_3 \n line_4`}                                       | ${0}         | ${true}
    ${'ignores comments'}    | ${`line_1 \n line_2 \n line_3 \n line_4 \n // line_5 \n // line_6`}             | ${2}         | ${true}
    ${'ignores blank lines'} | ${`line_1 \n line_2 \n line_3 \n line_4 \n\n\n\n\n\n\n // line_5 \n // line_6`} | ${2}         | ${true}
    ${'more than 5 lines'}   | ${`line_1 \n line_2 \n line_3 \n line_4 \n line_5 \n line_6`}                   | ${0}         | ${false}
  `('returns $isSmall ($description)', async ({ textContent, commentLines, isSmall }) => {
    const result = isSmallFile(textContent, commentLines);

    expect(result).toEqual(isSmall);
  });
});
