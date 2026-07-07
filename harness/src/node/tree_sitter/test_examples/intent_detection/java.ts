import dedent from 'dedent';
import { IntentDetectionExamples } from './types';

const examples: IntentDetectionExamples = {
  completion: [
    {
      document: {
        prefix: dedent`
        class Completion {
           public static
        `,
        suffix: '\n}',
        fileRelativePath: 'Completion.java',
        position: {
          line: 2,
          character: 18,
        },
        uri: 'file:///Completion.java',
        languageId: 'java',
      },
    },
    {
      document: {
        prefix:
          'public class MultiLineBlockCompletion {\n/* this is a\nmulti-line code comment. */\n\npublic static void ',
        suffix: '}',
        fileRelativePath: 'MultiLineBlockCompletion.java',
        position: {
          line: 5,
          character: 19,
        },
        uri: 'file:///MultiLineBlockCompletion.java',
        languageId: 'java',
      },
    },
  ],
  generation: [
    {
      document: {
        prefix: '// Create a main method which prints hello world.\n',
        suffix: '',
        fileRelativePath: 'Generation.java',
        position: {
          line: 1,
          character: 0,
        },
        uri: 'file:///Generation.java',
        languageId: 'java',
      },
    },
    {
      document: {
        prefix: dedent`
        class HelloWorldLineCommentGeneration {
          public static void main(String[] args) {
            // Print hello world and make me a sandwich.
        `,
        suffix: '   }\n}',
        fileRelativePath: 'HelloWorldLineCommentGeneration.java',
        position: {
          line: 4,
          character: 0,
        },
        uri: 'file:///HelloWorldLineCommentGeneration.java',
        languageId: 'java',
      },
    },
    {
      document: {
        prefix: dedent`
        class HelloWorldMultiLineCommentGeneration {
          public static void main(String[] args) {
            // Print hello world and make me a sandwich.
            // Add anchovies please!
        `,
        suffix: '   }\n}',
        fileRelativePath: 'HelloWorldMultiLineCommentGeneration.java',
        position: {
          line: 5,
          character: 0,
        },
        uri: 'file:///HelloWorldMultiLineCommentGeneration.java',
        languageId: 'java',
      },
    },
    {
      document: {
        prefix: dedent`
        class HelloWorldBlockCommentGeneration {
          public static void main(String[] args) {
            /* Print "this is a comment" to standard out. */
        `,
        suffix: '   }\n}',
        fileRelativePath: 'HelloWorldBlockCommentGeneration.java',
        position: {
          line: 4,
          character: 0,
        },
        uri: 'file:///HelloWorldBlockCommentGeneration.java',
        languageId: 'java',
      },
    },
    {
      document: {
        prefix:
          'public class MultiLineBlockGeneration {\n/* this is a\nmulti-line code comment.\n\n*/\n',
        suffix: '\n}',
        fileRelativePath: 'MultiLineBlockGeneration.java',
        position: {
          line: 5,
          character: 0,
        },
        uri: 'file:///MultiLineBlockGeneration.java',
        languageId: 'java',
      },
    },
  ],
};

export default examples;
