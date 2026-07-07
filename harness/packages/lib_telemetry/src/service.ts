export interface TelemetryService<TEvent, TEventContext, TTrackingContext> {
  trackEvent(event: TEvent, context?: TEventContext): void;
  setTrackingContext?(context: TTrackingContext): void;
  isEnabled(): boolean;
}

export interface SnowplowTracker<TEvent extends string, TEventContext, TTrackingContext>
  extends TelemetryService<TEvent, TEventContext, TTrackingContext> {
  hasClientContext(): boolean;
}
