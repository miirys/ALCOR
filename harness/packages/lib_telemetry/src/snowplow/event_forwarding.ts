import { ifVersionGte } from '@gitlab-org/core';
import {
  MIN_VERSION_FOR_EVENT_FORWARDING,
  MIN_VERSION_FOR_GITLAB_STANDARD_CONTEXT,
} from './constants';

/**
 * Determines if the GitLab instance supports event forwarding
 * Event forwarding is supported for self-managed instances >= 18.0
 * GitLab.com always routes through the monolith to include Standard Context
 * @param instanceUrl - The GitLab instance URL
 * @param instanceVersion - The GitLab instance version
 * @returns true if the instance supports event forwarding, false otherwise
 */
export function supportsEventForwarding(instanceUrl: URL, instanceVersion: string): boolean {
  if (instanceUrl.hostname === 'gitlab.com') {
    return true;
  }

  return ifVersionGte(
    instanceVersion,
    MIN_VERSION_FOR_EVENT_FORWARDING,
    () => true,
    () => false,
  );
}

/**
 * Returns true if the GitLab instance supports standard context enrichment (>= 19.0.0).
 * When supported, the monolith injects user identity fields into forwarded telemetry events.
 * @param instanceVersion - The GitLab instance version
 * @returns true if standard context enrichment is supported, false otherwise
 */
export function supportsStandardContext(instanceVersion: string): boolean {
  return ifVersionGte(
    instanceVersion,
    MIN_VERSION_FOR_GITLAB_STANDARD_CONTEXT,
    () => true,
    () => false,
  );
}

/**
 * Gets the event forwarder endpoint for a GitLab instance
 * @param instanceUrl - The GitLab instance URL
 * @returns The event forwarder endpoint URL
 */
export function getEventForwarderEndpoint(instanceUrl: URL): string {
  return `${instanceUrl.origin}/-/collect_events`;
}
