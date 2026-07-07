import { DuoWorkflowEventConnection } from './workflow_message_types';
import {
  generateGraphqlWorkflowId,
  getLatestEvent,
  parseWorkflowEventsResponse,
} from './workflow_event_utils';

describe('workflow_event_utils', () => {
  describe('generateGraphqlWorkflowId', () => {
    it('builds a GitLab GraphQL gid for a workflow id', () => {
      expect(generateGraphqlWorkflowId('123')).toBe('gid://gitlab/Ai::DuoWorkflows::Workflow/123');
    });
  });

  describe('parseWorkflowEventsResponse', () => {
    describe('when nodes are present', () => {
      it('returns the nodes array', () => {
        const response = {
          duoWorkflowEvents: { nodes: [{ id: '1' }, { id: '2' }] },
          duoWorkflowWorkflows: { nodes: [] },
        } as unknown as DuoWorkflowEventConnection;

        expect(parseWorkflowEventsResponse(response)).toEqual([{ id: '1' }, { id: '2' }]);
      });
    });

    describe('when response has no events', () => {
      it('returns an empty array', () => {
        const response = {
          duoWorkflowEvents: { nodes: [] },
          duoWorkflowWorkflows: { nodes: [] },
        } as unknown as DuoWorkflowEventConnection;

        expect(parseWorkflowEventsResponse(response)).toEqual([]);
      });
    });
  });

  describe('getLatestEvent', () => {
    describe('when there are no events', () => {
      it('returns null', () => {
        const response = {
          duoWorkflowEvents: { nodes: [] },
          duoWorkflowWorkflows: { nodes: [] },
        } as unknown as DuoWorkflowEventConnection;

        expect(getLatestEvent(response)).toBeNull();
      });
    });

    describe('when events are present', () => {
      it('returns the first event', () => {
        const firstEvent = { id: 'first' };
        const response = {
          duoWorkflowEvents: { nodes: [firstEvent, { id: 'second' }] },
          duoWorkflowWorkflows: { nodes: [] },
        } as unknown as DuoWorkflowEventConnection;

        expect(getLatestEvent(response)).toEqual(firstEvent);
      });
    });
  });
});
