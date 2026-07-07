import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { GitLabUser, ProjectDetails, UserService } from '@gitlab-org/core';
import { RootNamespaceIdService } from './root_namespace_id_service';
import type { GitLabParsedOptions } from './gitlab_parsed_options';

describe('RootNamespaceIdService', () => {
  let logger: TestLogger;

  function createUserService(user: Partial<GitLabUser> = {}): UserService {
    return createFakePartial<UserService>({
      getUser: jest.fn<UserService['getUser']>().mockResolvedValue(
        createFakePartial<GitLabUser>({
          duoDefaultNamespaceId: undefined,
          ...user,
        }),
      ),
    });
  }

  function createService(
    backendOpts: Partial<GitLabParsedOptions>,
    userService: UserService = createUserService(),
  ): RootNamespaceIdService {
    return new RootNamespaceIdService(
      logger,
      createFakePartial<GitLabParsedOptions>(backendOpts),
      userService,
    );
  }

  function projectWithRootNamespace(rootNamespaceGid?: string): ProjectDetails {
    return createFakePartial<ProjectDetails>({
      id: 'gid://gitlab/Project/80878669',
      namespace: {
        id: 'gid://gitlab/Namespace/121204394',
        rootNamespace: rootNamespaceGid ? { id: rootNamespaceGid } : undefined,
      },
    });
  }

  beforeEach(() => {
    logger = new TestLogger();
  });

  describe('priority 1: --duo-workflow-metadata rootNamespaceId', () => {
    it('returns the metadata rootNamespaceId', async () => {
      const service = createService({ duoWorkflowMetadata: { rootNamespaceId: '111' } });

      await expect(service.resolve()).resolves.toBe('111');
    });

    it('takes priority over the namespace-id flag and project details', async () => {
      const service = createService({
        duoWorkflowMetadata: { rootNamespaceId: '111' },
        duoWorkflowNamespaceId: '222',
      });

      await expect(
        service.resolve(projectWithRootNamespace('gid://gitlab/Group/333')),
      ).resolves.toBe('111');
    });
  });

  describe('priority 2: --duo-workflow-namespace-id flag', () => {
    it('returns the flag value when no metadata is present', async () => {
      const service = createService({ duoWorkflowNamespaceId: '222' });

      await expect(service.resolve()).resolves.toBe('222');
    });

    it('takes priority over project details', async () => {
      const service = createService({ duoWorkflowNamespaceId: '222' });

      await expect(
        service.resolve(projectWithRootNamespace('gid://gitlab/Group/333')),
      ).resolves.toBe('222');
    });
  });

  describe('priority 3: project details GraphQL lookup', () => {
    it('parses the numeric id from the root namespace GID', async () => {
      const service = createService({});

      await expect(
        service.resolve(projectWithRootNamespace('gid://gitlab/Group/121204394')),
      ).resolves.toBe('121204394');
    });
  });

  describe('priority 4: user default Duo namespace fallback', () => {
    it('falls back to the user default when no other source is available', async () => {
      const service = createService({}, createUserService({ duoDefaultNamespaceId: '99999' }));

      await expect(service.resolve()).resolves.toBe('99999');
    });

    it('falls back to the user default when project details lack a root namespace', async () => {
      const service = createService({}, createUserService({ duoDefaultNamespaceId: '99999' }));

      await expect(service.resolve(projectWithRootNamespace(undefined))).resolves.toBe('99999');
    });
  });

  describe('when no source is available', () => {
    it('returns an empty string and logs a warning', async () => {
      const service = createService({});

      await expect(service.resolve()).resolves.toBe('');
      expect(logger.warnLogs.some((e) => e.message?.includes('No project root namespace'))).toBe(
        true,
      );
    });

    it('returns an empty string when called without project details', async () => {
      const service = createService({});

      await expect(service.resolve(undefined)).resolves.toBe('');
    });
  });

  describe('logging', () => {
    it('logs the detected source at debug level', async () => {
      const service = createService({ duoWorkflowNamespaceId: '222' });

      await service.resolve();

      expect(
        logger.debugLogs.some((e) =>
          e.message?.includes('Using detected project root namespace id'),
        ),
      ).toBe(true);
    });

    it('logs use of the user default at debug level', async () => {
      const service = createService({}, createUserService({ duoDefaultNamespaceId: '99999' }));

      await service.resolve();

      expect(
        logger.debugLogs.some((e) => e.message?.includes("using user's default Duo namespace id")),
      ).toBe(true);
    });
  });
});
