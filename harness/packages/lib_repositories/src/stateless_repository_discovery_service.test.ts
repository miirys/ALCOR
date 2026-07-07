import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { TestLogger } from '@gitlab-org/logging';
import { StatelessRepositoryDiscoveryService as StatelessRepositoryDiscoveryServiceImpl } from './stateless_repository_discovery_service';

describe('StatelessRepositoryDiscoveryService', () => {
  describe('findRepositoryRoot', () => {
    let tempDir: string;

    const newService = () => new StatelessRepositoryDiscoveryServiceImpl(new TestLogger());

    afterEach(async () => {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('returns the repo root from a nested subdirectory', async () => {
      tempDir = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'repo-root-nested-')));
      await fs.mkdir(path.join(tempDir, '.git'));
      const nested = path.join(tempDir, 'a', 'b', 'c');
      await fs.mkdir(nested, { recursive: true });

      expect(await newService().findRepositoryRoot(nested)).toBe(tempDir);
    });

    it('treats a .git FILE (git worktree) as a repository', async () => {
      tempDir = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'repo-root-worktree-')));
      await fs.writeFile(path.join(tempDir, '.git'), 'gitdir: /somewhere/else\n');

      expect(await newService().findRepositoryRoot(tempDir)).toBe(tempDir);
    });

    it('throws when there is no .git anywhere up the tree', async () => {
      tempDir = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'repo-root-none-')));
      const nested = path.join(tempDir, 'x', 'y');
      await fs.mkdir(nested, { recursive: true });

      await expect(newService().findRepositoryRoot(nested)).rejects.toThrow(/is this a repository/);
    });
  });

  describe('getRepositoriesForWorkspaces', () => {
    it('should skip non-file:// workspace folders', async () => {
      const logger = new TestLogger();
      const service = new StatelessRepositoryDiscoveryServiceImpl(logger);

      const virtualFolder: WorkspaceFolder = {
        uri: 'adt://my-sap-server/sap/bc/adt/packages/zmy_package',
        name: 'SAP ABAP',
      };
      const fileFolder: WorkspaceFolder = {
        uri: 'file:///nonexistent/path/that/wont/be/scanned',
        name: 'Local',
      };

      const result = await service.getRepositoriesForWorkspaces([virtualFolder, fileFolder]);

      // virtualFolder should be skipped (no ENOENT), fileFolder returns empty (path doesn't exist)
      expect(result.size).toBe(0);
    });
  });
});
