import { mergeConfig } from 'tsdown';
import shared from '../tsdown.config.mts';

export default mergeConfig(shared, {
  format: ['esm', 'cjs'],
});
