import { createInterfaceId } from '@gitlab/needle';
import type { SessionEvent } from '../backend/backend';
import type { GetSessionHistoryOptions, SessionHistoryPage } from './session_history';

export interface SessionDataService {
  getSessionHistory(options: GetSessionHistoryOptions): Promise<SessionHistoryPage>;
  getSessionMessages(sessionId: string): Promise<SessionEvent[]>;
}

export const SessionDataService = createInterfaceId<SessionDataService>('SessionDataService');
