import { execSync } from 'node:child_process';
import * as fs from 'fs';
import { TestLogger } from '@gitlab-org/logging';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { ShellDetector } from './shell_detector';
import { ShellInfo } from './shell';

jest.mock('node:child_process');
jest.mock('fs');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ShellDetector', () => {
  let detector: ShellDetector;
  let logger: TestLogger;
  let configService: ConfigService;
  let originalEnv: NodeJS.ProcessEnv;
  let originalPlatform: NodeJS.Platform;
  let originalPpid: number | undefined;
  let originalCwd: () => string;

  beforeEach(() => {
    logger = new TestLogger();
    configService = new DefaultConfigService();
    detector = new ShellDetector(logger, configService);

    originalEnv = process.env;
    originalPlatform = process.platform;
    originalPpid = process.ppid;
    originalCwd = process.cwd;

    process.env = {};

    const mockCwd = jest.fn().mockReturnValue('/home/user');
    process.cwd = mockCwd;

    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    process.cwd = originalCwd;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    Object.defineProperty(process, 'ppid', {
      value: originalPpid,
    });
  });

  describe('detectSystemShell', () => {
    describe('Windows Shell Detection', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      it('detects Windows PowerShell via Get-Host command', () => {
        mockExecSync.mockReturnValue(Buffer.from(''));

        const result = detector.detectSystemShell();

        expect(result).toEqual<ShellInfo>({
          shellName: 'powershell',
          shellType: 'windows',
          shellVariant: 'Windows PowerShell',
          shellEnvironment: 'native',
          sshSession: false,
          cwd: '/home/user',
          detectionMethod: 'system-fallback',
        });
      });

      it('detects PowerShell Core via environment variable', () => {
        process.env.POWERSHELL_DISTRIBUTION_CHANNEL = 'PSCore';
        mockExecSync.mockReturnValue(Buffer.from(''));

        const result = detector.detectSystemShell();

        expect(result).toEqual<ShellInfo>({
          shellName: 'powershell',
          shellType: 'windows',
          shellVariant: 'PowerShell Core',
          shellEnvironment: 'native',
          sshSession: false,
          cwd: '/home/user',
          detectionMethod: 'system-fallback',
        });
      });

      it('detects Command Prompt when PowerShell detection fails', () => {
        mockExecSync.mockImplementation(() => {
          throw new Error('Not PowerShell');
        });

        const result = detector.detectSystemShell();

        expect(result).toEqual<ShellInfo>({
          shellName: 'cmd',
          shellType: 'windows',
          shellVariant: 'Command Prompt',
          shellEnvironment: 'native',
          sshSession: false,
          cwd: '/home/user',
          detectionMethod: 'system-fallback',
        });
      });

      it('detects Command Prompt via ComSpec fallback', () => {
        process.env.ComSpec = 'C:\\Windows\\System32\\cmd.exe';
        mockExecSync.mockImplementation(() => {
          throw new Error('Command failed');
        });

        const result = detector.detectSystemShell();

        expect(result).toEqual<ShellInfo>({
          shellName: 'cmd',
          shellType: 'windows',
          shellVariant: 'Command Prompt',
          shellEnvironment: 'native',
          sshSession: false,
          cwd: '/home/user',
          detectionMethod: 'system-fallback',
        });
      });

      it('returns null when ComSpec is not cmd.exe', () => {
        process.env.ComSpec = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
        mockExecSync.mockImplementation(() => {
          throw new Error('Command failed');
        });

        const result = detector.detectSystemShell();

        expect(result).toBeNull();
      });

      it('detects Git Bash on Windows', () => {
        process.env.SHELL = '/usr/bin/bash';

        const result = detector.detectSystemShell();

        expect(result).toEqual<ShellInfo>({
          shellName: 'bash',
          shellType: 'hybrid',
          shellVariant: 'Git Bash',
          shellEnvironment: 'git-bash',
          sshSession: false,
          cwd: '/home/user',
          detectionMethod: 'system-fallback',
        });
      });

      it('detects MinGW via MSYSTEM', () => {
        process.env.MSYSTEM = 'MINGW64';

        const result = detector.detectSystemShell();

        expect(result).toEqual<ShellInfo>({
          shellName: 'bash',
          shellType: 'hybrid',
          shellVariant: 'Git Bash',
          shellEnvironment: 'mingw',
          sshSession: false,
          cwd: '/home/user',
          detectionMethod: 'system-fallback',
        });
      });

      it('detects Cygwin via environment variable', () => {
        process.env.CYGWIN = 'nodosfilewarning';

        const result = detector.detectSystemShell();

        expect(result).toEqual<ShellInfo>({
          shellName: 'bash',
          shellType: 'hybrid',
          shellVariant: 'Cygwin',
          shellEnvironment: 'cygwin',
          sshSession: false,
          cwd: '/home/user',
          detectionMethod: 'system-fallback',
        });
      });
    });

    describe('Unix Shell Detection', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
      });

      it('detects bash shell via SHELL environment variable', () => {
        process.env.SHELL = '/bin/bash';

        const result = detector.detectSystemShell();

        expect(result).toEqual<ShellInfo>({
          shellName: 'bash',
          shellType: 'unix',
          shellEnvironment: 'native',
          sshSession: false,
          cwd: '/home/user',
          detectionMethod: 'system-fallback',
        });
      });

      it('detects zsh shell', () => {
        process.env.SHELL = '/bin/zsh';

        const result = detector.detectSystemShell();

        expect(result).toMatchObject({ shellName: 'zsh', shellType: 'unix' });
      });

      it('detects fish shell', () => {
        process.env.SHELL = '/usr/local/bin/fish';

        const result = detector.detectSystemShell();

        expect(result).toMatchObject({ shellName: 'fish', shellType: 'unix' });
      });

      it('detects shell via parent process ID', () => {
        Object.defineProperty(process, 'ppid', { value: 1234 });
        mockExecSync.mockReturnValue('zsh');

        const result = detector.detectSystemShell();

        expect(result).toMatchObject({ shellName: 'zsh', shellType: 'unix' });
        expect(mockExecSync).toHaveBeenCalledWith('ps -p 1234 -o comm=', {
          encoding: 'utf8',
          stdio: 'pipe',
        });
      });

      it('falls back to SHELL env when parent process detection fails', () => {
        Object.defineProperty(process, 'ppid', { value: 1234 });
        process.env.SHELL = '/bin/bash';
        mockExecSync.mockImplementation(() => {
          throw new Error('ps command failed');
        });

        const result = detector.detectSystemShell();

        expect(result).toMatchObject({ shellName: 'bash', shellType: 'unix' });
      });

      it('falls back to POSIX shell when all detection methods fail', () => {
        mockExecSync.mockImplementation(() => {
          throw new Error('Command failed');
        });

        const result = detector.detectSystemShell();

        expect(result).toEqual<ShellInfo>({
          shellName: 'sh',
          shellType: 'unix',
          shellVariant: 'POSIX shell',
          shellEnvironment: 'native',
          sshSession: false,
          cwd: '/home/user',
          detectionMethod: 'system-fallback',
        });
      });

      it('detects shells on macOS', () => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
        process.env.SHELL = '/bin/zsh';

        const result = detector.detectSystemShell();

        expect(result).toMatchObject({ shellName: 'zsh', shellType: 'unix' });
      });
    });

    describe('Environment Detection', () => {
      describe('WSL', () => {
        it('detects WSL via WSL_DISTRO_NAME', () => {
          process.env.WSL_DISTRO_NAME = 'Ubuntu';
          process.env.SHELL = '/bin/bash';
          Object.defineProperty(process, 'platform', { value: 'linux' });

          const result = detector.detectSystemShell();

          expect(result).toEqual<ShellInfo>({
            shellName: 'bash',
            shellType: 'hybrid',
            shellVariant: 'WSL Ubuntu',
            shellEnvironment: 'wsl',
            sshSession: false,
            cwd: '/home/user',
            detectionMethod: 'system-fallback',
          });
        });

        it('detects WSL via WSL_INTEROP', () => {
          process.env.WSL_INTEROP = '/run/WSL/1234';
          process.env.SHELL = '/bin/bash';
          Object.defineProperty(process, 'platform', { value: 'linux' });

          const result = detector.detectSystemShell();

          expect(result).toMatchObject({
            shellEnvironment: 'wsl',
            shellVariant: 'WSL Unknown',
          });
        });
      });

      describe('Docker', () => {
        it('detects Docker via .dockerenv file', () => {
          process.env.SHELL = '/bin/bash';
          Object.defineProperty(process, 'platform', { value: 'linux' });
          mockFs.existsSync.mockImplementation((path) => path === '/.dockerenv');

          const result = detector.detectSystemShell();

          expect(result).toMatchObject({ shellEnvironment: 'docker' });
        });

        it('detects Docker via cgroup file', () => {
          process.env.SHELL = '/bin/bash';
          Object.defineProperty(process, 'platform', { value: 'linux' });
          mockFs.existsSync.mockReturnValue(false);
          mockFs.readFileSync.mockImplementation((path) => {
            if (path === '/proc/self/cgroup') {
              return '1:name=systemd:/docker/container-id\n';
            }
            throw new Error('File not found');
          });

          const result = detector.detectSystemShell();

          expect(result).toMatchObject({ shellEnvironment: 'docker' });
        });
      });

      describe('SSH Session Detection', () => {
        it('detects SSH session via SSH_CLIENT', () => {
          process.env.SSH_CLIENT = '192.168.1.1 12345 22';
          process.env.SHELL = '/bin/bash';
          Object.defineProperty(process, 'platform', { value: 'linux' });

          const result = detector.detectSystemShell();

          expect(result).toMatchObject({ sshSession: true });
        });

        it('detects SSH session via SSH_TTY', () => {
          process.env.SSH_TTY = '/dev/pts/0';
          process.env.SHELL = '/bin/zsh';
          Object.defineProperty(process, 'platform', { value: 'linux' });

          const result = detector.detectSystemShell();

          expect(result).toMatchObject({ sshSession: true });
        });

        it('detects SSH in WSL environment', () => {
          process.env.WSL_DISTRO_NAME = 'Ubuntu';
          process.env.SSH_CLIENT = '192.168.1.1 12345 22';
          process.env.SHELL = '/bin/bash';
          Object.defineProperty(process, 'platform', { value: 'linux' });

          const result = detector.detectSystemShell();

          expect(result).toMatchObject({
            shellEnvironment: 'wsl',
            sshSession: true,
          });
        });
      });
    });

    describe('Error Handling', () => {
      it('handles platform detection errors gracefully', () => {
        Object.defineProperty(process, 'platform', {
          get: () => {
            throw new Error('Platform detection failed');
          },
        });

        const result = detector.detectSystemShell();

        expect(result).toBeNull();
      });

      it('returns null for unsupported platforms', () => {
        Object.defineProperty(process, 'platform', {
          value: 'aix' as NodeJS.Platform,
        });

        const result = detector.detectSystemShell();

        expect(result).toBeNull();
      });

      it('handles filesystem errors during environment detection gracefully', () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        mockExecSync.mockImplementation(() => {
          throw new Error('Command failed');
        });
        mockFs.existsSync.mockImplementation(() => {
          throw new Error('File system error');
        });
        mockFs.readFileSync.mockImplementation(() => {
          throw new Error('Read error');
        });

        const result = detector.detectSystemShell();

        expect(result).toMatchObject({
          shellName: 'sh',
          shellType: 'unix',
          shellVariant: 'POSIX shell',
          shellEnvironment: 'native',
        });
      });
    });

    describe('Current Working Directory', () => {
      it('includes CWD in returned shell info', () => {
        process.env.SHELL = '/bin/bash';
        Object.defineProperty(process, 'platform', { value: 'linux' });
        (process.cwd as jest.Mock).mockReturnValue('/custom/path');

        const result = detector.detectSystemShell();

        expect(result?.cwd).toBe('/custom/path');
      });

      it('falls back to "/" when process.cwd() throws', () => {
        process.env.SHELL = '/bin/bash';
        Object.defineProperty(process, 'platform', { value: 'linux' });
        (process.cwd as jest.Mock).mockImplementation(() => {
          throw new Error('Permission denied');
        });

        const result = detector.detectSystemShell();

        expect(result?.cwd).toBe('/');
      });
    });
  });

  describe('isSSHSession', () => {
    it('returns false when no SSH env vars are set', () => {
      expect(detector.isSSHSession()).toBe(false);
    });

    it('returns true when SSH_CLIENT is set', () => {
      process.env.SSH_CLIENT = '192.168.1.1 12345 22';
      expect(detector.isSSHSession()).toBe(true);
    });

    it('returns true when SSH_TTY is set', () => {
      process.env.SSH_TTY = '/dev/pts/0';
      expect(detector.isSSHSession()).toBe(true);
    });

    it('returns true when SSH_CONNECTION is set', () => {
      process.env.SSH_CONNECTION = '192.168.1.1 12345 192.168.1.2 22';
      expect(detector.isSSHSession()).toBe(true);
    });
  });

  describe('detectEnvironment', () => {
    it('returns null in a plain native environment', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(detector.detectEnvironment()).toBeNull();
    });

    it('returns "wsl" when WSL_DISTRO_NAME is set', () => {
      process.env.WSL_DISTRO_NAME = 'Ubuntu';
      expect(detector.detectEnvironment()).toBe('wsl');
    });

    it('returns "cygwin" when CYGWIN is set', () => {
      process.env.CYGWIN = 'nodosfilewarning';
      expect(detector.detectEnvironment()).toBe('cygwin');
    });

    it('returns "mingw" when MSYSTEM is set', () => {
      process.env.MSYSTEM = 'MINGW64';
      expect(detector.detectEnvironment()).toBe('mingw');
    });

    it('returns "git-bash" on win32 with bash SHELL', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.SHELL = '/usr/bin/bash';
      expect(detector.detectEnvironment()).toBe('git-bash');
    });
  });

  describe('getWorkspacePath', () => {
    it('returns process.cwd() by default', () => {
      (process.cwd as jest.Mock).mockReturnValue('/home/user/project');
      expect(detector.getWorkspacePath()).toBe('/home/user/project');
    });

    it('returns "/" when process.cwd() throws', () => {
      (process.cwd as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });
      expect(detector.getWorkspacePath()).toBe('/');
    });

    it('uses the file:// workspace folder path when available', () => {
      configService.set('workspaceFolders', [
        { uri: 'file:///home/user/project', name: 'project' },
      ]);
      expect(detector.getWorkspacePath()).toBe('/home/user/project');
    });

    it('falls back to cwd for virtual workspace folders to avoid pointing shell probes at non-existent paths', () => {
      configService.set('workspaceFolders', [
        { uri: 'adt://server/sap/bc/adt/packages/zmy_package', name: 'SAP ABAP' },
      ]);
      configService.set('cwd', '/tmp/fallback');
      expect(detector.getWorkspacePath()).toBe('/tmp/fallback');
    });
  });
});
