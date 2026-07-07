import { mergeConfig } from 'tsdown';
import shared from '../tsdown.config.mts';

export default mergeConfig(shared, {
  entry: {
    index: 'src/index.ts',
    errors: 'src/errors.ts',
    worker: 'src/worker/worker_main.ts',
    'feature-state': 'src/feature_state/public.ts',
    empty: 'src/empty_sandbox_availability_service.ts',
  },
});
