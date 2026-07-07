import dedent from 'dedent';
import { IntentDetectionExamples } from './types';

const examples: IntentDetectionExamples = {
  completion: [
    {
      document: {
        prefix: dedent`
        package main

        import "fmt"

        func main() {
            fmt.Println("hello world")
        `,
        suffix: '}',
        fileRelativePath: 'completion.go',
        position: {
          line: 5,
          character: 30,
        },
        uri: 'file:///completion.go',
        languageId: 'javascript',
      },
    },
  ],
  generation: [
    {
      document: {
        prefix: dedent`
        package main

        import "fmt"

        func main() {

            // Print a hello world message to the console\n
        `,
        suffix: '}',
        fileRelativePath: 'generation.go',
        position: {
          line: 7,
          character: 0,
        },
        uri: 'file:///generation.go',
        languageId: 'javascript',
      },
    },
    {
      document: {
        prefix: dedent`
        package main

        import "fmt"

        func main() {

            // Print a hello world message to the console


        }
        `,
        suffix: '',
        fileRelativePath: 'generation.go',
        position: {
          line: 8,
          character: 0,
        },
        uri: 'file:///generation.go',
        languageId: 'javascript',
      },
    },
  ],
};

export default examples;
