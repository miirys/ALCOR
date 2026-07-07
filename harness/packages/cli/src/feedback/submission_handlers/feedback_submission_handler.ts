export interface FeedbackSubmission {
  description: string;
  title: string;
  type: 'bug' | 'feature';
  includeLogs: boolean;
}

export interface FeedbackSubmissionParams extends FeedbackSubmission {
  labels: string[];
}

/**
 * Result returned by submission handlers after successfully submitting feedback.
 */
export interface SubmissionResult {
  method: 'api' | 'url';
  issueNumber?: number;
  issueUrl?: string;
}

/**
 * Interface for feedback submission strategies.
 * Implementations handle submitting feedback via different methods (API, URL, etc.).
 * Handlers return a result object instead of mutating state directly.
 */
export interface FeedbackSubmissionHandler {
  submit(params: FeedbackSubmissionParams): Promise<SubmissionResult>;
}
