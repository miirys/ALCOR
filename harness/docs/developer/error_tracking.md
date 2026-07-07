# Error Tracking

The key to our Sentry error tracking is that all Personal Data must be removed from the error. When tracking errors in Sentry, ensure they are tracked as Sanitized Errors. You can search for `SanitizedError` in the codebase to see how errors are sent to Sentry.

**Note**: When using `neverthrow` Result types, only report `Err` results to Sentry when they represent unexpected system failures, not normal error flows that are handled gracefully.

## Rules for error tracking

This is the set of rules that we must abide by when tracking errors:

- Do not track any data that could be traced back to the user, the data that would come closest to identify the user is that the user has read/write role or the Maintainer role to the project
- When tracking information about a project, [track projectID for `gitlab.com`, but for GitLab Self-Managed and GitLab Dedicated, we'll only use a hash](https://gitlab.com/gitlab-com/legal-and-compliance/-/issues/2065#note_1915313426 "Adding Sentry to Editor Extensions for error tracking - Privacy Review") of `instanceUrl+project` (e.g. SHA1)
- For [MRs and issues, we'll track IIDs](https://gitlab.com/gitlab-com/legal-and-compliance/-/issues/2065#note_1909754214 "Adding Sentry to Editor Extensions for error tracking - Privacy Review") (e.g. `MR!21`), but never title or any other textual information
- We won't be tracking file paths or file content and generally will abide by this [pseudonymization guide](https://metrics.gitlab.com/identifiers/)
  - for `gitlab.com`, keep the identifiers
  - for GitLab Self-Managed and GitLab Dedicated, a one-way hashing function of the identifiers.
- The Sentry error tracking will be on by default, but it can be disabled by the global "telemetry=off" editor setting.
