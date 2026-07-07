import { z } from 'zod';

// FIXME: rename this to FileAndCursor or FileAndPosition
export const IDocContext = z.object({
  /**
   * The text before the cursor.
   */
  prefix: z.string().describe('The text before the cursor.'),
  /**
   * The text after the cursor.
   */
  suffix: z.string().describe('The text after the cursor.'),
  /**
   * This is most likely path to a file relative to the workspace
   *  but if the file doesn't belong to a workspace, this field is identical to document URI
   *
   * Example: If the workspace root is `/home/user/workspace`
   * and the file is `/home/user/workspace/src/file.txt`,
   * then the filename is `src/file.txt`.
   */
  fileRelativePath: z
    .string()
    .describe(
      'Path to a file relative to the workspace, or identical to document URI if file does not belong to a workspace.',
    ),
  position: z
    .object({
      line: z.number(),
      character: z.number(),
    })
    .describe('The position in the document.'),
  /**
   * The URI of the document.
   */
  uri: z.string().describe('The URI of the document.'),
  /**
   * languageId of the document
   * @readonly
   */
  languageId: z.string().describe('languageId of the document'),
  /**
   * The workspace folder that the document belongs to.
   */
  workspaceFolder: z
    .object({
      uri: z.string(),
      name: z.string(),
    })
    .optional()
    .describe('The workspace folder that the document belongs to.'),
});

export type IDocContext = z.infer<typeof IDocContext>;

export interface IDocTransformer {
  transform(context: IDocContext): IDocContext;
}
