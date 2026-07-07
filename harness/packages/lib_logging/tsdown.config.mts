import { mergeConfig } from 'tsdown';
import shared from '../tsdown.config.mts';

export default mergeConfig(shared, {
  entry: {
    index: 'src/index.ts',
    browser: 'src/browser.ts',
  },
});
