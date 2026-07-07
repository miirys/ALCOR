import { createInterfaceId } from '@gitlab/needle';
import { SnowplowTracker } from '../service';

export const EXTENSION_ACTIVITY_CATEGORY = 'gitlab_extension_activity';

export enum EXTENSION_ACTIVITY_EVENT {
  ActiveInstallation = 'active_installation',
}

export interface ExtensionActivityContext {
  timestamp: number;
  [key: string]: unknown;
}

export interface ExtensionActivitySnowplowTracker
  extends SnowplowTracker<EXTENSION_ACTIVITY_EVENT, ExtensionActivityContext, null> {
  trackEvent(event: EXTENSION_ACTIVITY_EVENT, context?: ExtensionActivityContext): Promise<void>;
}

export const ExtensionActivitySnowplowTracker = createInterfaceId<ExtensionActivitySnowplowTracker>(
  'ExtensionActivitySnowplowTracker',
);
