import { mergeConfig } from 'tsdown';
import shared from '../tsdown.config.mts';

export default mergeConfig(shared, {
  entry: {
    index: 'src/index.ts',
    node: 'src/node.ts',
    test_utils: 'src/test_utils.ts',
    test_fixtures: 'src/test_fixtures.ts',
  },
});
