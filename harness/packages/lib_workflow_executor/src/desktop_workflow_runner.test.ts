import path from 'path';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial, drainAsyncGenerator } from '@gitlab-org/test-utils';
import { WorkflowType, DuoWorkflowEvent, DuoWorkflowStatus } from '@gitlab-lsp/workflow-api';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import type { AIContextItem } from '@gitlab-org/ai-context';
import { UserService } from '@gitlab-org/core';
import { ExecutorManager } from './executors/executor_manager';
import type { GenerateTokenResponse } from './api/types';
import type { NodeExecutor } from './executors/node/node_executor';
import type { WorkflowRailsService } from './api/workflow_rails_service';
import type { WorkflowTokenService } from './api/workflow_token_service';
import type { ModelResolverService } from './model_resolver_service';
import { DesktopWorkflowRunner } from './desktop_workflow_runner';

describe('DesktopWorkflowRunner', () => {
  let api: DesktopWorkflowRunner;
  let configService: ConfigService;
  let mockWorkflowRailsService: WorkflowRailsService;
  let mockWorkflowTokenService: WorkflowTokenService;
  let mockModelResolverService: ModelResolverService;
  let mockExecutorManager: ExecutorManager;
  let mockNodeExecutor: NodeExecutor;
  let mockUserService: UserService;

  const basePath = path.resolve('/Users/test/projects/LSP');
  const mockLogger = new TestLogger();

  const createRunner = () => {
    return new DesktopWorkflowRunner(
      configService,
      mockLogger,
      mockWorkflowRailsService,
      mockWorkflowTokenService,
      mockExecutorManager,
      mockModelResolverService,
      mockUserService,
    );
  };

  beforeEach(() => {
    configService = new DefaultConfigService();
    mockWorkflowRailsService = createFakePartial<WorkflowRailsService>({
      createWorkflow: jest.fn().mockResolvedValue('mock-workflow-id'),
      getWorkflowToken: jest.fn().mockResolvedValue(createFakePartial<GenerateTokenResponse>({})),
      getGraphqlData: jest.fn(),
      updateStatus: jest.fn(),
      sendEvent: jest.fn(),
      setAgentPrivileges: jest.fn(),
    });
    mockWorkflowTokenService = createFakePartial<WorkflowTokenService>({
      getTokenFromCache: jest.fn().mockReturnValue(null),
      getToken: jest.fn().mockResolvedValue(createFakePartial<GenerateTokenResponse>({})),
      cacheToken: jest.fn(),
      revokeToken: jest.fn(),
      dispose: jest.fn(),
    });
    mockNodeExecutor = createFakePartial<NodeExecutor>({
      runWorkflow: jest.fn().mockImplementation(async function* () {
        // Mock async generator that yields mock workflow events
        const mockEvent: DuoWorkflowEvent = {
          checkpoint: JSON.stringify({
            channel_values: { status: 'Planning' },
          }),
          errors: [],
          workflowGoal: 'test goal',
          workflowStatus: DuoWorkflowStatus.RUNNING,
        };
        yield mockEvent;
      }),
      disposeAsync: jest.fn().mockResolvedValue(undefined),
      stopWorkflow: jest.fn(),
      interruptRunningCommand: jest.fn(),
    });

    mockExecutorManager = createFakePartial<ExecutorManager>({
      getExecutorForWorkflow: jest.fn().mockReturnValue(mockNodeExecutor),
      setupExecutorDisposal: jest.fn(),
      clearExecutorDisposal: jest.fn(),
      disposeExecutor: jest.fn().mockResolvedValue(undefined),
      disposeAsync: jest.fn().mockResolvedValue(undefined),
    });
    mockModelResolverService = createFakePartial<ModelResolverService>({
      resolveModel: jest.fn().mockResolvedValue(undefined),
    });
    mockUserService = createFakePartial<UserService>({
      getUser: jest.fn().mockResolvedValue({
        id: 'gid://gitlab/User/1',
        restId: 1,
        username: 'test-user',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        duoDefaultNamespacePath: undefined,
      }),
    });
  });

  describe('runWorkflow', () => {
    beforeEach(() => {
      api = createRunner();
    });

    describe('when there are no folders configured', () => {
      beforeEach(() => {
        configService.set('workspaceFolders', []);
      });

      it('should throw an error', async () => {
        const generator = api.runWorkflow({
          goal: 'test-goal',
          metadata: {},
          additionalContext: [],
        });

        await expect(async () => {
          await drainAsyncGenerator(generator);
        }).rejects.toThrow('No workspace folders');
      });
    });

    describe('when there are multiple folders configured', () => {
      beforeEach(() => {
        configService.set('workspaceFolders', [
          {
            uri: `file://${basePath}`,
            name: 'LSP',
          },
          {
            uri: `file:///wow`,
            name: 'WOW',
          },
        ]);
      });

      it('should select the first folder when no workspaceFolderUri is provided', async () => {
        mockLogger.info = jest.fn();

        await drainAsyncGenerator(
          api.runWorkflow({
            goal: 'test-goal',
            metadata: {},
            additionalContext: [],
          }),
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
          `[Duo Workflow Runner] More than one workspace folder detected. Using workspace folder /Users/test/projects/LSP`,
          undefined,
        );
      });

      it('should select the folder matching workspaceFolderUri', async () => {
        await drainAsyncGenerator(
          api.runWorkflow({
            goal: 'test-goal',
            metadata: { rootFsPath: '/wow' },
            additionalContext: [],
          }),
        );

        expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({ workspaceFolderPath: '/wow' }),
        );
      });

      it('should fall back to first folder when workspaceFolderUri does not match', async () => {
        await drainAsyncGenerator(
          api.runWorkflow({
            goal: 'test-goal',
            metadata: { rootFsPath: '/nonexistent' },
            additionalContext: [],
          }),
        );

        expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({ workspaceFolderPath: '/Users/test/projects/LSP' }),
        );
      });
    });

    describe('when the workspace folder uses a virtual filesystem URI', () => {
      const virtualUri = 'adt://server/sap/bc/adt/packages/zmy_package';

      beforeEach(() => {
        configService.set('workspaceFolders', [
          {
            uri: virtualUri,
            name: 'SAP ABAP',
          },
        ]);
      });

      it('does not throw when running a workflow with a virtual filesystem workspace', async () => {
        await expect(
          drainAsyncGenerator(
            api.runWorkflow({
              goal: 'test-goal',
              metadata: {},
              additionalContext: [],
            }),
          ),
        ).resolves.not.toThrow();
      });

      it('passes the URI path component as workspaceFolderPath', async () => {
        await drainAsyncGenerator(
          api.runWorkflow({
            goal: 'test-goal',
            metadata: {},
            additionalContext: [],
          }),
        );

        expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            workspaceFolderPath: '/sap/bc/adt/packages/zmy_package',
            workspaceFolderUri: virtualUri,
          }),
        );
      });
    });

    describe('when using node executor', () => {
      beforeEach(() => {
        configService.merge({
          workspaceFolders: [
            {
              uri: `file://${basePath}`,
              name: 'LSP',
            },
          ],
          projectPath: 'mynamespace/myproject',
          duo: {
            workflow: {},
          },
        });
      });

      it('gets executor for each workflow from manager', async () => {
        expect(mockExecutorManager.getExecutorForWorkflow).not.toHaveBeenCalled();

        jest.mocked(mockWorkflowRailsService.createWorkflow).mockResolvedValue('workflow-id-1');
        await drainAsyncGenerator(
          api.runWorkflow({
            goal: 'test-goal',
            metadata: {},
            additionalContext: [],
          }),
        );

        expect(mockExecutorManager.getExecutorForWorkflow).toHaveBeenCalledTimes(1);
        expect(mockExecutorManager.getExecutorForWorkflow).toHaveBeenCalledWith('workflow-id-1');

        jest.mocked(mockWorkflowRailsService.createWorkflow).mockResolvedValue('workflow-id-2');
        await drainAsyncGenerator(
          api.runWorkflow({
            goal: 'test-goal-2',
            metadata: {},
            additionalContext: [],
          }),
        );

        expect(mockExecutorManager.getExecutorForWorkflow).toHaveBeenCalledTimes(2);
        expect(mockExecutorManager.getExecutorForWorkflow).toHaveBeenCalledWith('workflow-id-2');
      });

      it('calls executor manager for workflow when running again', async () => {
        expect(mockExecutorManager.getExecutorForWorkflow).not.toHaveBeenCalled();

        jest.mocked(mockWorkflowRailsService.createWorkflow).mockResolvedValue('workflow-id-1');
        await drainAsyncGenerator(
          api.runWorkflow({
            goal: 'test-goal',
            metadata: {},
            additionalContext: [],
          }),
        );

        expect(mockExecutorManager.getExecutorForWorkflow).toHaveBeenCalledTimes(1);

        await drainAsyncGenerator(
          api.runWorkflow({
            existingWorkflowId: 'workflow-id-1',
            goal: 'test-goal',
            metadata: {},
            additionalContext: [],
          }),
        );

        expect(mockExecutorManager.getExecutorForWorkflow).toHaveBeenCalledTimes(2);
      });

      describe('with flowConfig', () => {
        const goal = 'Test goal';
        const type = WorkflowType.SOFTWARE_DEVELOPMENT;
        const flowConfig = 'agent_name: custom-agent\nversion: 1.0';
        const additionalContext: AIContextItem[] = [];

        it('passes flowConfig to executor runWorkflow', async () => {
          await drainAsyncGenerator(
            api.runWorkflow({
              goal,
              type,
              existingWorkflowId: 'existing-workflow-id',
              metadata: {},
              additionalContext,
              flowConfig,
            }),
          );

          expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledWith({
            goal,
            type,
            existingWorkflowId: 'existing-workflow-id',
            workspaceFolderPath: '/Users/test/projects/LSP',
            workspaceFolderUri: 'file:///Users/test/projects/LSP',
            workflowId: 'existing-workflow-id',
            metadata: {},
            additionalContext,
            flowConfig,
          });
        });

        it('handles undefined flowConfig', async () => {
          await drainAsyncGenerator(
            api.runWorkflow({
              goal,
              type,
              existingWorkflowId: 'existing-workflow-id',
              metadata: {},
              additionalContext,
            }),
          );

          expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledWith({
            goal,
            type,
            existingWorkflowId: 'existing-workflow-id',
            workspaceFolderPath: '/Users/test/projects/LSP',
            workspaceFolderUri: 'file:///Users/test/projects/LSP',
            workflowId: 'existing-workflow-id',
            metadata: {},
            additionalContext,
            flowConfig: undefined,
          });
        });

        it('handles empty flowConfig', async () => {
          await drainAsyncGenerator(
            api.runWorkflow({
              goal,
              type,
              existingWorkflowId: 'existing-workflow-id',
              metadata: {},
              additionalContext,
              flowConfig: '',
            }),
          );

          expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledWith({
            goal,
            type,
            existingWorkflowId: 'existing-workflow-id',
            workspaceFolderPath: '/Users/test/projects/LSP',
            workspaceFolderUri: 'file:///Users/test/projects/LSP',
            workflowId: 'existing-workflow-id',
            metadata: {},
            additionalContext,
            flowConfig: '',
          });
        });
      });
    });

    describe('when correctly configured', () => {
      beforeEach(() => {
        configService.merge({
          workspaceFolders: [
            {
              uri: `file://${basePath}`,
              name: 'LSP',
            },
          ],
          projectPath: 'mynamespace/myproject',
          duo: {
            workflow: {},
          },
        });
      });

      describe('when an existingWorkflowId has not been provided as an argument', () => {
        beforeEach(() => {
          mockWorkflowRailsService.createWorkflow = jest.fn().mockResolvedValue('new-workflow-id');
          mockWorkflowRailsService.getWorkflowToken = jest
            .fn()
            .mockResolvedValue(createFakePartial<GenerateTokenResponse>({}));
        });

        describe('when token is cached', () => {
          beforeEach(() => {
            mockWorkflowTokenService.getTokenFromCache = jest
              .fn()
              .mockReturnValue(createFakePartial<GenerateTokenResponse>({}));
          });

          it('should create a new workflow and always fetch a fresh token', async () => {
            await drainAsyncGenerator(
              api.runWorkflow({
                goal: 'test-goal',
                type: WorkflowType.SOFTWARE_DEVELOPMENT,
                existingWorkflowId: undefined,
                workflowDefinition: 'test_agent/v1',
                metadata: {},
                additionalContext: [],
              }),
            );

            expect(mockWorkflowRailsService.createWorkflow).toHaveBeenCalledWith(
              'test-goal',
              { project_id: 'mynamespace/myproject', namespace_id: undefined },
              'software_development',
              'test_agent/v1',
              undefined,
              undefined,
            );
            expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledWith(
              'software_development',
              undefined,
              'mynamespace/myproject',
            );
            expect(mockWorkflowTokenService.cacheToken).toHaveBeenCalled();
          });
        });

        describe('when token is not cached', () => {
          beforeEach(() => {
            mockWorkflowTokenService.getTokenFromCache = jest.fn().mockReturnValue(null);
          });

          it('should parallelize workflow creation and token fetching', async () => {
            const createWorkflowPromise = Promise.resolve('new-workflow-id');
            const getTokenPromise = Promise.resolve(
              createFakePartial<GenerateTokenResponse>({
                gitlab_rails: { token: 'test-token' },
              }),
            );

            mockWorkflowRailsService.createWorkflow = jest
              .fn()
              .mockReturnValue(createWorkflowPromise);
            mockWorkflowRailsService.getWorkflowToken = jest.fn().mockReturnValue(getTokenPromise);

            await drainAsyncGenerator(
              api.runWorkflow({
                goal: 'test-goal',
                type: WorkflowType.SOFTWARE_DEVELOPMENT,
                existingWorkflowId: undefined,
                workflowDefinition: 'test_agent/v1',
                metadata: {},
                additionalContext: [],
              }),
            );

            expect(mockWorkflowRailsService.createWorkflow).toHaveBeenCalledWith(
              'test-goal',
              { project_id: 'mynamespace/myproject', namespace_id: undefined },
              'software_development',
              'test_agent/v1',
              undefined,
              undefined,
            );
            expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledWith(
              'software_development',
              undefined,
              'mynamespace/myproject',
            );
            expect(mockWorkflowTokenService.cacheToken).toHaveBeenCalledWith(
              'new-workflow-id',
              'software_development',
              { gitlab_rails: { token: 'test-token' } },
            );
          });

          it('should pass rootNamespaceId to getWorkflowToken when provided in metadata', async () => {
            const rootNamespaceId = 'gid://gitlab/Group/123';
            const createWorkflowPromise = Promise.resolve('new-workflow-id');
            const getTokenPromise = Promise.resolve(
              createFakePartial<GenerateTokenResponse>({
                gitlab_rails: { token: 'test-token' },
              }),
            );

            mockWorkflowRailsService.createWorkflow = jest
              .fn()
              .mockReturnValue(createWorkflowPromise);
            mockWorkflowRailsService.getWorkflowToken = jest.fn().mockReturnValue(getTokenPromise);

            await drainAsyncGenerator(
              api.runWorkflow({
                goal: 'test-goal',
                type: WorkflowType.SOFTWARE_DEVELOPMENT,
                existingWorkflowId: undefined,
                metadata: { rootNamespaceId },
                additionalContext: [],
              }),
            );

            expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledWith(
              'software_development',
              rootNamespaceId,
              'mynamespace/myproject',
            );
          });

          it('should handle parallel execution correctly when both operations complete', async () => {
            // Simulate timing to ensure both operations are called in parallel
            let createWorkflowCalled = false;
            let getTokenCalled = false;

            mockWorkflowRailsService.createWorkflow = jest.fn().mockImplementation(() => {
              createWorkflowCalled = true;
              return Promise.resolve('new-workflow-id');
            });

            mockWorkflowRailsService.getWorkflowToken = jest.fn().mockImplementation(() => {
              getTokenCalled = true;
              return Promise.resolve(
                createFakePartial<GenerateTokenResponse>({
                  gitlab_rails: { token: 'test-token' },
                }),
              );
            });

            await drainAsyncGenerator(
              api.runWorkflow({
                goal: 'test-goal',
                type: WorkflowType.SOFTWARE_DEVELOPMENT,
                existingWorkflowId: undefined,
                metadata: {},
                additionalContext: [],
              }),
            );

            expect(createWorkflowCalled).toBe(true);
            expect(getTokenCalled).toBe(true);
            expect(mockWorkflowTokenService.cacheToken).toHaveBeenCalledWith(
              'new-workflow-id',
              'software_development',
              { gitlab_rails: { token: 'test-token' } },
            );
          });

          it('should use default workflow type when type is not provided', async () => {
            await drainAsyncGenerator(
              api.runWorkflow({
                goal: 'test-goal',
                existingWorkflowId: undefined,
                metadata: {},
                additionalContext: [],
              }),
            );

            expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledWith(
              'software_development',
              undefined,
              'mynamespace/myproject',
            );
          });
        });
      });

      describe('when receiving existingWorkflowId as an argument', () => {
        beforeEach(async () => {
          mockWorkflowRailsService.createWorkflow = jest.fn();

          await drainAsyncGenerator(
            api.runWorkflow({
              goal: 'test-goal',
              existingWorkflowId: 'existing-workflow-id',
              metadata: {},
              additionalContext: [],
            }),
          );
        });

        it('should not create a new workflow', () => {
          expect(mockWorkflowRailsService.createWorkflow).not.toHaveBeenCalled();
        });
      });

      it('it should run the workflow on the executor', async () => {
        const additionalContext: AIContextItem[] = [
          {
            id: 'file:///path/to/file.ts',
            category: 'file',
            metadata: {
              title: 'file.ts',
              enabled: true,
              subType: 'open_tab',
              icon: 'document',
              secondaryText: '/path/to/file.ts',
              subTypeLabel: 'Project file',
            },
          },
        ];

        await drainAsyncGenerator(
          api.runWorkflow({
            goal: 'test-goal',
            existingWorkflowId: 'existing-workflow-id',
            metadata: {},
            additionalContext,
          }),
        );

        expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledWith({
          existingWorkflowId: 'existing-workflow-id',
          workspaceFolderPath: '/Users/test/projects/LSP',
          workspaceFolderUri: 'file:///Users/test/projects/LSP',
          goal: 'test-goal',
          metadata: {},
          workflowId: 'existing-workflow-id',
          additionalContext,
        });
      });

      it('should pass both metadata and additionalOptions when creating new workflow', async () => {
        const metadata = {
          projectPath: 'custom/project',
        };
        const additionalOptions = {
          allowAgentToRequestUser: false,
          agentPrivileges: [1, 2, 3],
        };

        await drainAsyncGenerator(
          api.runWorkflow({
            goal: 'test-goal',
            metadata,
            additionalContext: [],
            additionalOptions,
          }),
        );

        expect(mockWorkflowRailsService.createWorkflow).toHaveBeenCalledWith(
          'test-goal',
          { project_id: 'custom/project', namespace_id: undefined },
          WorkflowType.SOFTWARE_DEVELOPMENT,
          undefined,
          undefined,
          additionalOptions,
        );
      });
    });

    describe('when projectPath is configured', () => {
      beforeEach(() => {
        configService.merge({
          workspaceFolders: [
            {
              uri: `file://${basePath}`,
              name: 'LSP',
            },
          ],
          projectPath: 'mynamespace/myproject',
          duo: {
            workflow: {},
          },
        });
      });

      it('should use project_id and set namespace_id to undefined', async () => {
        await drainAsyncGenerator(
          api.runWorkflow({
            goal: 'test-goal',
            metadata: {},
            additionalContext: [],
          }),
        );

        expect(mockWorkflowRailsService.createWorkflow).toHaveBeenCalledWith(
          'test-goal',
          { project_id: 'mynamespace/myproject', namespace_id: undefined },
          WorkflowType.SOFTWARE_DEVELOPMENT,
          undefined,
          undefined,
          undefined,
        );
      });
    });

    describe('when defaultNamespace is configured without projectPath', () => {
      beforeEach(() => {
        configService.merge({
          workspaceFolders: [
            {
              uri: `file://${basePath}`,
              name: 'LSP',
            },
          ],
          projectPath: undefined,
          duo: {
            workflow: {},
            agentPlatform: {
              enabled: true,
              defaultNamespace: 'my-namespace',
            },
          },
        });
      });

      it('should use namespace_id and set project_id to undefined', async () => {
        await drainAsyncGenerator(
          api.runWorkflow({
            goal: 'test-goal',
            metadata: {},
            additionalContext: [],
          }),
        );

        expect(mockWorkflowRailsService.createWorkflow).toHaveBeenCalledWith(
          'test-goal',
          { project_id: undefined, namespace_id: 'my-namespace' },
          WorkflowType.SOFTWARE_DEVELOPMENT,
          undefined,
          undefined,
          undefined,
        );
      });
    });
  });

  describe('preCreateWorkflow', () => {
    beforeEach(() => {
      api = createRunner();
    });

    describe('when there are no workspace folders configured', () => {
      beforeEach(() => {
        configService.set('workspaceFolders', []);
      });

      it('should throw an error', async () => {
        await expect(
          api.preCreateWorkflow('test draft goal', WorkflowType.SOFTWARE_DEVELOPMENT),
        ).rejects.toThrow('No workspace folders');
      });

      it('should not call workflow services', async () => {
        await expect(
          api.preCreateWorkflow('test draft goal', WorkflowType.SOFTWARE_DEVELOPMENT),
        ).rejects.toThrow();

        expect(mockWorkflowRailsService.createWorkflow).not.toHaveBeenCalled();
      });
    });

    describe('when workspace folders are configured', () => {
      beforeEach(() => {
        configService.merge({
          workspaceFolders: [
            {
              uri: `file://${basePath}`,
              name: 'LSP',
            },
          ],
          projectPath: 'mynamespace/myproject',
          duo: {
            workflow: {},
          },
        });
      });

      describe('when both services succeed', () => {
        beforeEach(() => {
          jest
            .mocked(mockWorkflowRailsService.createWorkflow)
            .mockResolvedValue('pre-created-workflow-id');
          jest
            .mocked(mockWorkflowTokenService.getToken)
            .mockResolvedValue(createFakePartial<GenerateTokenResponse>({}));
        });

        it('should create workflow and get token successfully', async () => {
          const result = await api.preCreateWorkflow(
            'test draft goal',
            WorkflowType.SOFTWARE_DEVELOPMENT,
            'test_agent/v1',
          );

          expect(result).toBe('pre-created-workflow-id');
          expect(mockWorkflowRailsService.createWorkflow).toHaveBeenCalledWith(
            'test draft goal',
            { project_id: 'mynamespace/myproject', namespace_id: undefined },
            WorkflowType.SOFTWARE_DEVELOPMENT,
            'test_agent/v1',
            undefined,
            undefined,
          );
          expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledWith(
            WorkflowType.SOFTWARE_DEVELOPMENT,
            undefined,
            'mynamespace/myproject',
          );
        });

        it('should pass metadata to createWorkflow when provided', async () => {
          const metadata = {
            projectPath: 'custom/project',
          };

          const result = await api.preCreateWorkflow(
            'test draft goal',
            WorkflowType.SOFTWARE_DEVELOPMENT,
            'test_agent/v1',
            'catalog-item-123',
            metadata,
            undefined,
          );

          expect(result).toBe('pre-created-workflow-id');
          expect(mockWorkflowRailsService.createWorkflow).toHaveBeenCalledWith(
            'test draft goal',
            { project_id: 'custom/project', namespace_id: undefined },
            WorkflowType.SOFTWARE_DEVELOPMENT,
            'test_agent/v1',
            undefined,
            undefined,
          );
        });

        it('should prioritize metadata projectPath over config projectPath', async () => {
          const metadata = {
            projectPath: 'metadata/project',
          };

          const result = await api.preCreateWorkflow(
            'test draft goal',
            WorkflowType.SOFTWARE_DEVELOPMENT,
            'test_agent/v1',
            'catalog-item-123',
            metadata,
            undefined,
          );

          expect(result).toBe('pre-created-workflow-id');
          expect(mockWorkflowRailsService.createWorkflow).toHaveBeenCalledWith(
            'test draft goal',
            { project_id: 'metadata/project', namespace_id: undefined },
            WorkflowType.SOFTWARE_DEVELOPMENT,
            'test_agent/v1',
            undefined,
            undefined,
          );
        });

        it('should pass additionalOptions to createWorkflow when provided', async () => {
          const additionalOptions = {
            allowAgentToRequestUser: false,
            agentPrivileges: [1, 2, 3],
            preApprovedAgentPrivileges: [1, 2],
          };

          const result = await api.preCreateWorkflow(
            'test draft goal',
            WorkflowType.SOFTWARE_DEVELOPMENT,
            'test_agent/v1',
            undefined,
            undefined,
            additionalOptions,
          );

          expect(result).toBe('pre-created-workflow-id');
          expect(mockWorkflowRailsService.createWorkflow).toHaveBeenCalledWith(
            'test draft goal',
            { project_id: 'mynamespace/myproject', namespace_id: undefined },
            WorkflowType.SOFTWARE_DEVELOPMENT,
            'test_agent/v1',
            undefined,
            additionalOptions,
          );
        });

        it('should pass both metadata and additionalOptions when provided', async () => {
          const metadata = {
            projectPath: 'custom/project',
          };
          const additionalOptions = {
            allowAgentToRequestUser: false,
            agentPrivileges: [1, 2, 3],
          };

          const result = await api.preCreateWorkflow(
            'test draft goal',
            WorkflowType.SOFTWARE_DEVELOPMENT,
            'test_agent/v1',
            'catalog-item-123',
            metadata,
            additionalOptions,
          );

          expect(result).toBe('pre-created-workflow-id');
          expect(mockWorkflowRailsService.createWorkflow).toHaveBeenCalledWith(
            'test draft goal',
            { project_id: 'custom/project', namespace_id: undefined },
            WorkflowType.SOFTWARE_DEVELOPMENT,
            'test_agent/v1',
            undefined,
            additionalOptions,
          );
        });
      });

      describe('when createWorkflow fails', () => {
        beforeEach(() => {
          const createWorkflowError = new Error('Failed to create workflow');
          jest
            .mocked(mockWorkflowRailsService.createWorkflow)
            .mockRejectedValue(createWorkflowError);
        });

        it('should propagate the error', async () => {
          await expect(
            api.preCreateWorkflow('test draft goal', WorkflowType.SOFTWARE_DEVELOPMENT),
          ).rejects.toThrow('Failed to create workflow');

          expect(mockWorkflowRailsService.createWorkflow).toHaveBeenCalledWith(
            'test draft goal',
            { project_id: 'mynamespace/myproject', namespace_id: undefined },
            WorkflowType.SOFTWARE_DEVELOPMENT,
            undefined,
            undefined,
            undefined,
          );
          expect(mockWorkflowTokenService.getToken).not.toHaveBeenCalled();
        });
      });

      describe('when getWorkflowToken fails', () => {
        beforeEach(() => {
          jest
            .mocked(mockWorkflowRailsService.createWorkflow)
            .mockResolvedValue('pre-created-workflow-id');
          const getTokenError = new Error('Failed to get token');
          jest.mocked(mockWorkflowRailsService.getWorkflowToken).mockRejectedValue(getTokenError);
        });

        it('should propagate the error when token fetch fails', async () => {
          await expect(
            api.preCreateWorkflow('test draft goal', WorkflowType.SOFTWARE_DEVELOPMENT),
          ).rejects.toThrow('Failed to get token');

          expect(mockWorkflowTokenService.cacheToken).not.toHaveBeenCalled();
        });
      });

      describe('when getWorkflowToken fails with InvalidInstanceVersionError', () => {
        beforeEach(() => {
          jest
            .mocked(mockWorkflowRailsService.createWorkflow)
            .mockResolvedValue('pre-created-workflow-id');
          jest
            .mocked(mockWorkflowRailsService.getWorkflowToken)
            .mockRejectedValue(new InvalidInstanceVersionError('instance too old'));
        });

        it('should not block workflow creation and log at debug level', async () => {
          mockLogger.debug = jest.fn();
          mockLogger.error = jest.fn();

          const workflowId = await api.preCreateWorkflow(
            'test draft goal',
            WorkflowType.SOFTWARE_DEVELOPMENT,
          );

          expect(workflowId).toBe('pre-created-workflow-id');
          expect(mockWorkflowTokenService.cacheToken).not.toHaveBeenCalled();
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.stringContaining('direct_access token not available'),
            expect.any(InvalidInstanceVersionError),
          );
          expect(mockLogger.error).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('interruptRunningCommand', () => {
    beforeEach(() => {
      configService.merge({
        workspaceFolders: [
          {
            uri: `file://${basePath}`,
            name: 'LSP',
          },
        ],
        projectPath: 'mynamespace/myproject',
        duo: {
          workflow: {},
        },
      });
      api = createRunner();
    });

    it('should find the corresponding executor and call `interruptRunningCommand`', async () => {
      const workflowId = 'mock-id';

      await drainAsyncGenerator(
        api.runWorkflow({
          existingWorkflowId: workflowId,
          goal: 'test-goal',
          metadata: {},
          additionalContext: [],
        }),
      );

      api.interruptRunningCommand(workflowId);

      expect(mockExecutorManager.getExecutorForWorkflow).toHaveBeenCalledWith(workflowId);
      expect(mockNodeExecutor.interruptRunningCommand).toHaveBeenCalled();
    });
  });

  describe('stopWorkflow', () => {
    beforeEach(() => {
      configService.merge({
        workspaceFolders: [
          {
            uri: `file://${basePath}`,
            name: 'LSP',
          },
        ],
        projectPath: 'mynamespace/myproject',
        duo: {
          workflow: {},
        },
      });
      api = createRunner();
    });

    it('should find the corresponding executor and call `stopWorkflow`', async () => {
      const workflowId = 'mock-id';

      await drainAsyncGenerator(
        api.runWorkflow({
          existingWorkflowId: workflowId,
          goal: 'test-goal',
          metadata: {},
          additionalContext: [],
        }),
      );

      api.stopWorkflow(workflowId);

      expect(mockExecutorManager.getExecutorForWorkflow).toHaveBeenCalledWith(workflowId);
      expect(mockNodeExecutor.stopWorkflow).toHaveBeenCalled();
    });
  });

  describe('updateAgentPrivileges', () => {
    beforeEach(() => {
      api = createRunner();
    });

    it('delegates to the updateAgentPrivileges GraphQL operation with the global workflow id', async () => {
      jest.mocked(mockWorkflowRailsService.getGraphqlData).mockResolvedValue({
        updateDuoWorkflowAgentPrivileges: { workflow: { id: 'x' }, errors: [] },
      });

      const errors = await api.updateAgentPrivileges('42', [8], [8]);

      expect(mockWorkflowRailsService.getGraphqlData).toHaveBeenCalledWith({
        operationName: 'updateAgentPrivileges',
        query: null,
        variables: {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/42',
          agentPrivileges: [8],
          preApprovedAgentPrivileges: [8],
        },
      });
      expect(errors).toEqual([]);
    });

    it('returns the errors reported by the mutation', async () => {
      jest.mocked(mockWorkflowRailsService.getGraphqlData).mockResolvedValue({
        updateDuoWorkflowAgentPrivileges: { workflow: null, errors: ['nope'] },
      });

      const errors = await api.updateAgentPrivileges('42', [8], [8]);

      expect(errors).toEqual(['nope']);
    });
  });
});
