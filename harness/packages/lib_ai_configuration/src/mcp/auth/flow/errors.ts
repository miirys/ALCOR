import { type ErrorBase, createError } from '../../../core/error';

type AuthFlowStateNotFound = ErrorBase<'AUTH_FLOW_STATE_NOT_FOUND', object>;

type AuthFlowFinalizerNotFound = ErrorBase<'AUTH_FLOW_FINALIZER_NOT_FOUND', { serverName: string }>;

type AuthFlowFinalizationFailed = ErrorBase<
  'AUTH_FLOW_FINALIZATION_FAILED',
  { serverName: string; cause?: unknown }
>;

export type AuthFlowError =
  | AuthFlowStateNotFound
  | AuthFlowFinalizerNotFound
  | AuthFlowFinalizationFailed;

export const AuthFlowError = {
  stateNotFound: (): AuthFlowStateNotFound =>
    createError(
      'AUTH_FLOW_STATE_NOT_FOUND',
      'No OAuth flow is registered for the provided state',
      {},
    ),

  finalizerNotFound: (serverName: string): AuthFlowFinalizerNotFound =>
    createError(
      'AUTH_FLOW_FINALIZER_NOT_FOUND',
      `No OAuth finalizer found for server: ${serverName}`,
      { serverName },
    ),

  finalizationFailed: (serverName: string, cause?: unknown): AuthFlowFinalizationFailed =>
    createError(
      'AUTH_FLOW_FINALIZATION_FAILED',
      `OAuth flow finalization failed for server: ${serverName}`,
      { serverName, cause },
    ),
} as const;
