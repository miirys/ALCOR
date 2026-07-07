import { DuoWorkflowLatestCheckpoint, DuoWorkflowStatus } from './workflow_message_types';
import {
  parseLangGraphCheckpoint,
  createDefaultWorkflowEvent,
  parseLatestCheckpointWorkflowData,
  getStatus,
} from './checkpoint_utils';

describe('checkpoint_utils', () => {
  describe('parseLangGraphCheckpoint', () => {
    describe('when the checkpoint is a valid JSON string', () => {
      const validCheckpoint = JSON.stringify({ key: 'value' });

      it('should successfully parse it', () => {
        expect(parseLangGraphCheckpoint(validCheckpoint)).toEqual({ key: 'value' });
      });
    });

    describe('when the checkpoint is invalid JSON', () => {
      const invalidCheckpoint = 'invalid json';

      it('should throw a parsing error', () => {
        expect(() => parseLangGraphCheckpoint(invalidCheckpoint)).toThrow(
          'Failed to parse checkpoint',
        );
      });
    });
  });

  describe('createDefaultWorkflowEvent', () => {
    it('should be the expected default event', () => {
      const defaultEvent = createDefaultWorkflowEvent();

      expect(defaultEvent).toEqual({
        errors: [],
        workflowStatus: DuoWorkflowStatus.RUNNING,
        checkpoint: {
          ts: expect.any(String),
          channel_values: {
            status: 'Planning',
          },
        },
        workflowGoal: '',
      });
    });
  });

  describe('parseLatestCheckpointWorkflowData', () => {
    describe.each([
      [
        'the response is empty',
        {
          duoWorkflowWorkflows: {
            nodes: [],
          },
        } as DuoWorkflowLatestCheckpoint,
      ],
      [
        'latestCheckpoint is null',
        {
          duoWorkflowWorkflows: {
            nodes: [{ latestCheckpoint: null }],
          },
        } as unknown as DuoWorkflowLatestCheckpoint,
      ],
    ])('when %s', (_, response) => {
      it('should return default workflow data', () => {
        const result = parseLatestCheckpointWorkflowData(response);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toEqual({
            errors: [],
            workflowStatus: DuoWorkflowStatus.RUNNING,
            checkpoint: {
              ts: expect.any(String),
              channel_values: {
                status: 'Planning',
              },
            },
            workflowGoal: '',
          });
        }
      });
    });

    describe('when the response contains valid checkpoint data', () => {
      const mockCheckpoint = JSON.stringify({
        ts: '2023-01-01T00:00:00Z',
        channel_values: { status: 'Completed' },
      });

      const response: DuoWorkflowLatestCheckpoint = {
        duoWorkflowWorkflows: {
          nodes: [
            {
              latestCheckpoint: {
                errors: [],
                workflowStatus: DuoWorkflowStatus.FINISHED,
                checkpoint: mockCheckpoint,
                workflowGoal: 'test goal',
              },
            },
          ],
        },
      };

      it('should parse and return the checkpoint data', () => {
        const result = parseLatestCheckpointWorkflowData(response);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toEqual({
            errors: [],
            workflowStatus: DuoWorkflowStatus.FINISHED,
            checkpoint: {
              ts: '2023-01-01T00:00:00Z',
              channel_values: { status: 'Completed' },
            },
            workflowGoal: 'test goal',
          });
        }
      });
    });

    describe('when the checkpoint contains invalid JSON', () => {
      const response: DuoWorkflowLatestCheckpoint = {
        duoWorkflowWorkflows: {
          nodes: [
            {
              latestCheckpoint: {
                errors: [],
                workflowStatus: DuoWorkflowStatus.RUNNING,
                checkpoint: 'invalid json',
                workflowGoal: 'test goal',
              },
            },
          ],
        },
      };

      it('should return a parsing error', () => {
        const result = parseLatestCheckpointWorkflowData(response);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain('Failed to parse latest workflow checkpoint');
        }
      });
    });

    describe('when the response is malformed', () => {
      const response = null as unknown as DuoWorkflowLatestCheckpoint;

      it('should return default workflow data', () => {
        const result = parseLatestCheckpointWorkflowData(response);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toEqual({
            errors: [],
            workflowStatus: DuoWorkflowStatus.RUNNING,
            checkpoint: {
              ts: expect.any(String),
              channel_values: {
                status: 'Planning',
              },
            },
            workflowGoal: '',
          });
        }
      });
    });
  });

  describe('getStatus', () => {
    describe.each([
      [
        'RUNNING',
        DuoWorkflowStatus.RUNNING,
        {
          workflowStatus: DuoWorkflowStatus.RUNNING,
          checkpoint: {
            ts: '2023-06-15T14:30:00Z',
            channel_values: { status: 'Planning' as const },
          },
          errors: [],
          workflowGoal: '',
        },
      ],
      [
        'FINISHED',
        DuoWorkflowStatus.FINISHED,
        {
          workflowStatus: DuoWorkflowStatus.FINISHED,
          checkpoint: {
            ts: '2023-06-15T14:30:00Z',
            channel_values: { status: 'Completed' as const },
          },
          errors: [],
          workflowGoal: '',
        },
      ],
    ])('when the workflow event has %s status', (statusName, expectedStatus, mockEvent) => {
      it(`should return ${statusName} status`, () => {
        expect(getStatus(mockEvent)).toBe(expectedStatus);
      });
    });
  });
});
