import { ShouldRetryCheck } from '@gitlab-org/resiliency';
import { isFetchError } from './errors';

export const isNot4xxFailure: ShouldRetryCheck = (err) =>
  isFetchError(err) && (err.status < 400 || err.status >= 500);
