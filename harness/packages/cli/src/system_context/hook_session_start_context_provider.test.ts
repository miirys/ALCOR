import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import type { HookService, AggregatedSessionStartResult } from '@gitlab-org/hooks';
import type { WorkflowContext } from '@gitlab-org/ai-context';
import type { ParsedCliInput } from '../parse';
import { HookSessionStartContextProvider } from './hook_session_start_context_provider';

describe('HookSessionStartContextProvider', () => {
  let provider: HookSessionStartContextProvider;
  let mockHookService: HookService;
  let testLogger: TestLogger;

  beforeEach(() => {
    testLogger = new TestLogger();
    mockHookService = createFakePartial<HookService>({
      runSessionStart: jest.fn<HookService['runSessionStart']>(),
    });
    const cliInput = createFakePartial<ParsedCliInput>({
      enableProjectHooks: false,
    });
    provider = new HookSessionStartContextProvider(testLogger, mockHookService, cliInput);
  });

  describe('getItems', () => {
    describe('when no context is provided', () => {
      it('returns an empty array', async () => {
        const result = await provider.getItems();
        expect(result).toEqual([]);
      });

      it('does not call hookService', async () => {
        await provider.getItems();
        expect(mockHookService.runSessionStart).not.toHaveBeenCalled();
      });
    });

    describe('when context is provided', () => {
      const context: WorkflowContext = {
        sessionId: 'session-123',
        cwd: '/project/dir',
        source: 'startup',
      };

      describe('when hooks return additional context', () => {
        beforeEach(() => {
          (
            mockHookService.runSessionStart as jest.Mock<HookService['runSessionStart']>
          ).mockResolvedValue({
            additionalContext: 'Branch: main, Sprint: 42',
          } satisfies AggregatedSessionStartResult);
        });

        it('calls hookService with context cwd', async () => {
          await provider.getItems(context);
          expect(mockHookService.runSessionStart).toHaveBeenCalledWith(
            'session-123',
            '/project/dir',
            '',
            'startup',
            { enableProjectHooks: false },
          );
        });

        it('returns an AIContextItem with the hook context', async () => {
          const result = await provider.getItems(context);
          expect(result).toEqual([
            {
              category: 'agent_user_environment',
              content: 'Branch: main, Sprint: 42',
              id: 'agent_user_environment_hook_session_start',
              metadata: {
                title: 'Session Start Hook Context',
                enabled: true,
                subType: 'hook',
                icon: 'hook',
                secondaryText: 'Context from SessionStart hooks',
                subTypeLabel: 'Hook',
              },
            },
          ]);
        });
      });

      describe('when hooks return no additional context', () => {
        beforeEach(() => {
          (
            mockHookService.runSessionStart as jest.Mock<HookService['runSessionStart']>
          ).mockResolvedValue({});
        });

        it('returns an empty array', async () => {
          const result = await provider.getItems(context);
          expect(result).toEqual([]);
        });
      });

      describe('when hooks throw an error', () => {
        beforeEach(() => {
          (
            mockHookService.runSessionStart as jest.Mock<HookService['runSessionStart']>
          ).mockRejectedValue(new Error('hook crashed'));
        });

        it('returns an empty array', async () => {
          const result = await provider.getItems(context);
          expect(result).toEqual([]);
        });

        it('logs a warning', async () => {
          await provider.getItems(context);
          expect(testLogger.warnLogs).toHaveLength(1);
          expect(testLogger.warnLogs[0].message).toContain('Failed to run SessionStart hooks');
        });
      });

      describe('when source is resume', () => {
        it('passes resume source to hookService', async () => {
          (
            mockHookService.runSessionStart as jest.Mock<HookService['runSessionStart']>
          ).mockResolvedValue({});

          await provider.getItems({ ...context, source: 'resume' });
          expect(mockHookService.runSessionStart).toHaveBeenCalledWith(
            'session-123',
            '/project/dir',
            '',
            'resume',
            { enableProjectHooks: false },
          );
        });
      });
    });
  });
});
