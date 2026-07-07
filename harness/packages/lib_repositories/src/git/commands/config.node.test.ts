import { readFileSync } from 'fs';
import { homedir } from 'os';
import SSHConfig from 'ssh-config';
import { URI } from 'vscode-uri';
import { TestLogger } from '@gitlab-org/logging';
import { NodeGitConfigCommand } from './config.node';

jest.mock('fs');
jest.mock('os');
jest.mock('ssh-config');

const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockHomedir = homedir as jest.MockedFunction<typeof homedir>;
const mockSSHConfig = SSHConfig as jest.Mocked<typeof SSHConfig>;

describe('NodeGitConfigCommand', () => {
  let command: NodeGitConfigCommand;
  let mockLogger: TestLogger;

  beforeEach(() => {
    mockLogger = new TestLogger();
    command = new NodeGitConfigCommand(mockLogger);
    mockHomedir.mockReturnValue('/home/user');
  });

  describe('getRemoteUrl', () => {
    it('resolves SSH alias in HTTPS URL', async () => {
      const mockConfig = {
        compute: jest.fn().mockReturnValue({ HostName: 'gitlab.com' }),
      };
      mockSSHConfig.parse = jest
        .fn()
        .mockReturnValue(mockConfig as unknown as ReturnType<typeof SSHConfig.parse>);
      mockReadFileSync.mockReturnValue('config content');

      const result = await command.getRemoteUrl(
        URI.file('/repo/.git/config'),
        'origin',
        'https://gitlab-home/gitlab-org/gitlab-jetbrains-plugin.git',
      );

      expect(result).toBe('https://gitlab.com/gitlab-org/gitlab-jetbrains-plugin.git');
    });

    it('resolves SSH alias in git@ URL', async () => {
      const mockConfig = {
        compute: jest.fn().mockReturnValue({ HostName: 'gitlab.com' }),
      };
      mockSSHConfig.parse = jest
        .fn()
        .mockReturnValue(mockConfig as unknown as ReturnType<typeof SSHConfig.parse>);
      mockReadFileSync.mockReturnValue('config content');

      const result = await command.getRemoteUrl(
        URI.file('/repo/.git/config'),
        'origin',
        'git@gitlab-home:gitlab-org/repo.git',
      );

      expect(result).toBe('git@gitlab.com:gitlab-org/repo.git');
    });

    it('returns fallback when no SSH config exists', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });

      const result = await command.getRemoteUrl(
        URI.file('/repo/.git/config'),
        'origin',
        'git@gitlab-home:org/repo.git',
      );

      expect(result).toBe('git@gitlab-home:org/repo.git');
    });

    it('returns fallback when hostname not in SSH config', async () => {
      const mockConfig = {
        compute: jest.fn().mockReturnValue({}),
      };
      mockSSHConfig.parse = jest
        .fn()
        .mockReturnValue(mockConfig as unknown as ReturnType<typeof SSHConfig.parse>);
      mockReadFileSync.mockReturnValue('config content');

      const result = await command.getRemoteUrl(
        URI.file('/repo/.git/config'),
        'origin',
        'git@gitlab-home:org/repo.git',
      );

      expect(result).toBe('git@gitlab-home:org/repo.git');
    });

    it('handles direct hostnames without aliases', async () => {
      const mockConfig = {
        compute: jest.fn().mockReturnValue({}),
      };
      mockSSHConfig.parse = jest
        .fn()
        .mockReturnValue(mockConfig as unknown as ReturnType<typeof SSHConfig.parse>);
      mockReadFileSync.mockReturnValue('config content');

      const result = await command.getRemoteUrl(
        URI.file('/repo/.git/config'),
        'origin',
        'https://gitlab.com/namespace/project.git',
      );

      expect(result).toBe('https://gitlab.com/namespace/project.git');
    });
  });
});
