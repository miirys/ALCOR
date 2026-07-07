import dedent from 'dedent';
import type { IntentDetectionExamples } from './types';

const examples: IntentDetectionExamples = {
  completion: [
    {
      document: {
        prefix: 'def sayHello():',
        suffix: '',
        fileRelativePath: 'completion.py',
        position: {
          line: 0,
          character: 15,
        },
        uri: 'file:///completion.py',
        languageId: 'python',
      },
    },
  ],
  generation: [
    {
      document: {
        prefix: '# Create a function that says hello world.\n',
        suffix: '',
        fileRelativePath: 'generation.py',
        position: {
          line: 1,
          character: 0,
        },
        uri: 'file:///generation.py',
        languageId: 'python',
      },
    },
    {
      document: {
        prefix: dedent`
        # Create a function that says hello world.


        def sayHello():
          print("Hello World!")
        `,
        suffix: '',
        fileRelativePath: 'generation.py',
        position: {
          line: 2,
          character: 0,
        },
        uri: 'file:///generation.py',
        languageId: 'python',
      },
    },
  ],
};

export default examples;
