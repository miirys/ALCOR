import dedent from 'dedent';
import { IntentDetectionExamples } from './types';

const examples: IntentDetectionExamples = {
  completion: [
    {
      document: {
        prefix: '',
        suffix: '',
        fileRelativePath: 'completion.js',
        position: {
          line: 3,
          character: 0,
        },
        uri: 'file:///completion.js',
        languageId: 'javascript',
      },
    },
    {
      document: {
        prefix: 'function sayHello() {',
        suffix: '}',
        fileRelativePath: 'completion.js',
        position: {
          line: 0,
          character: 21,
        },
        uri: 'file:///completion.js',
        languageId: 'javascript',
      },
    },
  ],
  generation: [
    {
      document: {
        prefix: '// Create a function that says hello world.\n',
        suffix: '',
        fileRelativePath: 'generation.js',
        position: {
          line: 1,
          character: 0,
        },
        uri: 'file:///generation.js',
        languageId: 'javascript',
      },
    },
    {
      document: {
        prefix: dedent`
        function checkA11YDefaultState() {
          cy.visitStory('base/label');

          // Generate a new cy command

          cy.glCheckA11y();
        }
        `,
        suffix: '',
        fileRelativePath: 'generation.js',
        position: {
          line: 4,
          character: 0,
        },
        uri: 'file:///generation.js',
        languageId: 'javascript',
      },
    },
  ],
};

export default examples;
