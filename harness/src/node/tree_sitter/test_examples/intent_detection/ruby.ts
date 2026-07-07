import dedent from 'dedent';
import { IntentDetectionExamples } from './types';

const examples: IntentDetectionExamples = {
  completion: [
    {
      document: {
        prefix: 'def sayHello(name)',
        suffix: '}',
        fileRelativePath: 'completion.rb',
        position: {
          line: 0,
          character: 18,
        },
        uri: 'file:///completion.rb',
        languageId: 'ruby',
      },
    },
  ],
  generation: [
    {
      document: {
        prefix: '# Create a function that says hello world.\n',
        suffix: '',
        fileRelativePath: 'generation.rb',
        position: {
          line: 1,
          character: 0,
        },
        uri: 'file:///generation.rb',
        languageId: 'ruby',
      },
    },
    {
      document: {
        prefix: dedent`
        # Create a function that says hello world.

        def sayHello(name)
          puts "Hello #{name}!"
        end
        `,
        suffix: '',
        fileRelativePath: 'generation.rb',
        position: {
          line: 1,
          character: 0,
        },
        uri: 'file:///generation.rb',
        languageId: 'ruby',
      },
    },
  ],
};

export default examples;
