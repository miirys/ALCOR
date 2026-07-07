import { type AiDuoWorkflowsWorkflowID } from '@gitlab-org/graphql';
import { WorkflowEventSource } from '@gitlab-org/telemetry';

export type FeedbackType = 'thumbs_up' | 'thumbs_down';

export interface PredefinedReason {
  key: string;
  label: string;
  isCustom?: boolean;
}

export const i18n = {
  TELL_US_MORE: 'Tell us more',
  TOO_GENERIC: 'Too generic',
  MISSING_STEPS: 'Missing steps',
  WRONG_CONTEXT: 'Wrong context',
  OUTDATED_INCORRECT: 'Outdated/incorrect',
  SOLVED_PROBLEM: 'Solved my problem',
  SAVED_TIME: 'Saved me time',
  GOOD_EXAMPLES: 'Good examples',
  ACCURATE_INFO: 'Accurate information',
};

export const ThumbsDownReasons: PredefinedReason[] = [
  { key: 'too_generic', label: i18n.TOO_GENERIC },
  { key: 'missing_steps', label: i18n.MISSING_STEPS },
  { key: 'wrong_context', label: i18n.WRONG_CONTEXT },
  { key: 'outdated_incorrect', label: i18n.OUTDATED_INCORRECT },
  { key: 'tell_us_more', label: i18n.TELL_US_MORE, isCustom: true },
];

export const ThumbsUpReasons: PredefinedReason[] = [
  { key: 'solved_problem', label: i18n.SOLVED_PROBLEM },
  { key: 'saved_time', label: i18n.SAVED_TIME },
  { key: 'good_examples', label: i18n.GOOD_EXAMPLES },
  { key: 'accurate_info', label: i18n.ACCURATE_INFO },
  { key: 'tell_us_more', label: i18n.TELL_US_MORE, isCustom: true },
];

export interface FeedbackPayload {
  feedbackType: FeedbackType;
  reason: string;
}

export interface UserFeedbackContext {
  workflowType: WorkflowEventSource;
  workflowId: AiDuoWorkflowsWorkflowID;
  feedback: FeedbackPayload;
}
