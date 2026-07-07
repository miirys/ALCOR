import dedent from 'dedent';
import { IntentDetectionExamples } from './types';

const examples: IntentDetectionExamples = {
  completion: [
    {
      document: {
        prefix: 'const sayHello: FunnyFunction = () => {',
        suffix: '}',
        fileRelativePath: 'completion.ts',
        position: {
          line: 0,
          character: 39,
        },
        uri: 'file:///completion.ts',
        languageId: 'typescript',
      },
    },
    {
      document: {
        prefix: dedent`
        // sayHello is a function that greets you
        const sayHello: FunnyFunction = () => {',
        `,
        suffix: '}',
        fileRelativePath: 'completion.ts',
        position: {
          line: 1,
          character: 41,
        },
        uri: 'file:///completion.ts',
        languageId: 'typescript',
      },
    },
  ],
  generation: [
    {
      document: {
        prefix: '// Create a function that says hello world.\n',
        suffix: '',
        fileRelativePath: 'generation.ts',
        position: {
          line: 1,
          character: 0,
        },
        uri: 'file:///generation.ts',
        languageId: 'typescript',
      },
    },
    {
      document: {
        prefix: dedent`
        //This is a comment

        const sayHello: FunnyFunction = () => {
        `,
        suffix: '}',
        fileRelativePath: 'generation.ts',
        position: {
          line: 1,
          character: 0,
        },
        uri: 'file:///generation.ts',
        languageId: 'typescript',
      },
    },
  ],
};

export default examples;
