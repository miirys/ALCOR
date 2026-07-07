import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import type { SessionEvent } from '../backend';
import { SessionDataService } from '../../sessions/session_data_service';
import type { SessionHistoryPage } from '../../sessions/session_history';

@Implements(SessionDataService)
@Service({
  dependencies: [],
  lifetime: ServiceLifetime.Singleton,
})
export class NoopSessionDataService implements SessionDataService {
  async getSessionHistory(): Promise<SessionHistoryPage> {
    return { items: [], pageInfo: { hasNextPage: false, hasPreviousPage: false } };
  }

  async getSessionMessages(): Promise<SessionEvent[]> {
    return [];
  }
}
