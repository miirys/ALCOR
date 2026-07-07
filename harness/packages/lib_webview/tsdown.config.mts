import { mergeConfig } from 'tsdown';
import shared from '../tsdown.config.mts';

export default mergeConfig(shared, {
  entry: {
    index: 'src/index.ts',
    test_utils: 'src/test_utils/mocks.ts',
  },
});
