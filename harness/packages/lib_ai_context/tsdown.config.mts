import { mergeConfig } from 'tsdown';
import shared from '../tsdown.config.mts';

export default mergeConfig(shared, {
  entry: {
    index: 'src/index.ts',
    node: 'src/node/index.ts',
    test_utils: 'src/test_utils/mock_data.ts',
  },
});
