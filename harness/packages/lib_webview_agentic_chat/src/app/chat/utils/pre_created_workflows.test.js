import { processPreCreatedWorkflows } from './pre_created_workflows';

describe('processPreCreatedWorkflows', () => {
  const baseWorkflow = {
    id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/1022638',
    projectId: 'gid://gitlab/Project/46519181',
    humanStatus: 'input required',
    updatedAt: '2025-07-03T22:51:50Z',
    goal: 'Tod',
  };

  const validCheckpoint = {
    checkpoint: JSON.stringify({
      v: 2,
      id: '1f058604-c4b6-63f3-bfff-12f1f0da6d1c',
      channel_values: {
        __start__: {
          ui_chat_log: [
            {
              status: 'success',
              content: 'Today is Friday',
              timestamp: '2025-07-03T22:51:46.403107+00:00',
              message_type: 'user',
            },
          ],
        },
      },
    }),
  };

  describe('when processing workflows with valid checkpoints', () => {
    it('should fix goals for workflows with valid checkpoints', () => {
      const workflows = [
        {
          ...baseWorkflow,
          firstCheckpoint: validCheckpoint,
        },
      ];

      const result = processPreCreatedWorkflows(workflows);

      expect(result).toHaveLength(1);
      expect(result[0].goal).toBe('Today is Friday');
    });

    it('should preserve workflows without checkpoint changes needed', () => {
      const workflows = [
        {
          ...baseWorkflow,
          firstCheckpoint: null,
        },
      ];

      const result = processPreCreatedWorkflows(workflows);

      expect(result).toHaveLength(1);
      expect(result[0].goal).toBe(baseWorkflow.goal);
    });
  });

  describe('when processing workflows with dangling pre-created workflows', () => {
    describe('when a workflow has null firstCheckpoint and created status', () => {
      describe('when a workflow has a goal less than the minimum character count', () => {
        it('should be filtered out', () => {
          const workflows = [
            {
              ...baseWorkflow,
              firstCheckpoint: null,
              humanStatus: 'created',
              goal: 'Hi',
            },
            {
              ...baseWorkflow,
              firstCheckpoint: validCheckpoint,
            },
          ];

          const result = processPreCreatedWorkflows(workflows);

          expect(result).toHaveLength(1);
          expect(result[0].goal).toBe('Today is Friday');
        });
      });

      describe('when a workflow has a goal with minimum character count', () => {
        it('should be filtered out', () => {
          const workflows = [
            {
              ...baseWorkflow,
              firstCheckpoint: null,
              humanStatus: 'created',
              goal: 'Tod',
            },
            {
              ...baseWorkflow,
              firstCheckpoint: validCheckpoint,
            },
          ];

          const result = processPreCreatedWorkflows(workflows);

          expect(result).toHaveLength(1);
          expect(result[0].goal).toBe('Today is Friday');
        });
      });

      describe('when a workflow has a goal longer than the minimum character count', () => {
        it('should be preserved', () => {
          const workflows = [
            {
              ...baseWorkflow,
              firstCheckpoint: null,
              humanStatus: 'created',
              goal: 'This is a longer goal',
            },
          ];

          const result = processPreCreatedWorkflows(workflows);

          expect(result).toHaveLength(1);
          expect(result[0].goal).toBe('This is a longer goal');
        });
      });
    });

    describe('when all workflows are dangling', () => {
      it('should return empty array', () => {
        const workflows = [
          {
            ...baseWorkflow,
            firstCheckpoint: null,
            humanStatus: 'created',
          },
        ];

        const result = processPreCreatedWorkflows(workflows);

        expect(result).toHaveLength(0);
      });
    });
  });

  describe('when processing mixed workflow scenarios', () => {
    it('should handle workflows with malformed checkpoints', () => {
      const workflows = [
        {
          ...baseWorkflow,
          firstCheckpoint: {
            checkpoint: 'invalid json',
          },
        },
      ];

      const result = processPreCreatedWorkflows(workflows);

      expect(result).toHaveLength(1);
      expect(result[0].goal).toBe(baseWorkflow.goal);
    });

    it('should handle empty workflows array', () => {
      const result = processPreCreatedWorkflows([]);

      expect(result).toHaveLength(0);
    });
  });
});
