/**
 * Mock implementation of @gitlab-org/telemetry for Storybook
 */

export enum DuoAgentPlatformEvent {}

export class DuoAgentPlatformTracker {
  trackEvent() {}

  trackPageView() {}

  trackError() {}

  trackTiming() {}
}
