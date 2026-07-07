import { REQUEST_TIMEOUT_MILLISECONDS } from './constants';
import { extractURL } from './extract_url';

export class FetchTimeoutError extends Error {
  constructor(url: URL | RequestInfo) {
    const timeoutInSeconds = Math.round(REQUEST_TIMEOUT_MILLISECONDS / 1000);
    super(
      `Request to ${extractURL(url)} timed out after ${timeoutInSeconds} second${timeoutInSeconds === 1 ? '' : 's'}`,
    );
  }
}
