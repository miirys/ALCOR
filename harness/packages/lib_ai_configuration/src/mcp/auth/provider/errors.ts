import { type ErrorBase, createError } from '../../../core/error';

type OAuthCallbackServerStartFailed = ErrorBase<
  'OAUTH_CALLBACK_SERVER_START_FAILED',
  { cause?: unknown }
>;

export type OAuthFactoryError = OAuthCallbackServerStartFailed;

export const OAuthFactoryError = {
  callbackServerStartFailed: (cause?: unknown): OAuthCallbackServerStartFailed =>
    createError('OAUTH_CALLBACK_SERVER_START_FAILED', 'Failed to start OAuth callback server', {
      cause,
    }),
} as const;
