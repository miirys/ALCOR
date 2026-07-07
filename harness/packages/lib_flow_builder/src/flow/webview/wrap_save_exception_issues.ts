import { FlowValidationCode } from '../validation/codes';
import type { FlowValidationIssue } from '../validation/types';

/**
 * Codes whose issues represent unexpected runtime exceptions (IO, YAML
 * dump, converter throw) rather than user-facing validation findings.
 */
const SAVE_EXCEPTION_CODES = new Set<string>([
  FlowValidationCode.Io,
  FlowValidationCode.Format,
  FlowValidationCode.Conversion,
]);

const DEFAULT_GENERIC_MESSAGE = "Couldn't save this flow";

/**
 * Apply the save-boundary wrapping rule: each issue whose code identifies a
 * runtime exception gets its user-facing `message` replaced with a neutral
 * `genericMessage`, while the original message and any pre-existing details
 * are folded into `details` for diagnosis. Stack traces never reach this
 * layer (only `Error.message` is read upstream).
 *
 * Validation codes (`flow.schema`, `flow.semantic`) carry author-friendly
 * strings and pass through unchanged.
 *
 * `genericMessage` defaults to "Couldn't save this flow" for the local-save
 * boundary. Other write boundaries (e.g. catalog create) should pass a
 * verb-appropriate string.
 */
export function wrapSaveExceptionIssues(
  issues: FlowValidationIssue[],
  genericMessage: string = DEFAULT_GENERIC_MESSAGE,
): FlowValidationIssue[] {
  return issues.map((issue) => {
    if (!SAVE_EXCEPTION_CODES.has(issue.code)) return issue;
    const detail = issue.details ? `${issue.message}: ${issue.details}` : issue.message;
    return {
      ...issue,
      message: genericMessage,
      details: detail,
    };
  });
}
