export interface ShellInfo {
  shellName: string;
  shellType: 'unix' | 'windows' | 'hybrid';
  shellVariant?: string;
  shellEnvironment?: 'native' | 'wsl' | 'git-bash' | 'cygwin' | 'mingw' | 'ssh' | 'docker';
  sshSession?: boolean;
  cwd?: string;
  detectionMethod?: 'system-fallback' | 'ide-terminal';
}
