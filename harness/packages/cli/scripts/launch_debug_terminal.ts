#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import path, { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_ROOT = resolve(__dirname, '..');
const DEBUGGER_INITIALIZATION_DELAY_MS = 1500;

interface TerminalConfig {
  command: string;
  args: string[];
}

// Parse command line arguments
const args = process.argv.slice(2);
const cliArgs = args.slice(1); // Additional arguments to pass to the CLI

// Append 'exit' to close the terminal window/tab when the process ends
const debugCommand = `cd "${CLI_ROOT}" && node --inspect-brk=127.0.0.1:9229 ./dist/index.js ${cliArgs.join(' ')}; exit`;

// this is non-exhaustive list of terminals we might be interested to test CLI in. feel free to use any other terminal as well.
const knownTerminals = {
  xplatform: {
    ghostty: 'ghostty',
    alacritty: 'alacritty',
    wezterm: 'wezterm',
    warp: 'warp',
  },
  darwin: {
    iterm: 'iterm',
    terminal: 'terminal',
  },
  linux: {
    gnomeTerminal: 'gnome-terminal',
    konsole: 'konsole',
    xterm: 'xterm',
  },
};

const { xplatform, darwin, linux } = knownTerminals;

// Get the terminal app from environment variable (changing env var requires vscode restart)
// or change the line bellow to select a different terminal to debug in.
const terminalApp = process.env.DUO_DEBUG_TERMINAL_APP || darwin.terminal;
const currentPlatform = platform();

function getMacOSTerminalConfig(app: string | undefined): TerminalConfig {
  const terminalApp = app ?? 'terminal';
  switch (terminalApp) {
    case 'iterm':
    case 'iterm2': {
      // Using osascript to open iTerm2 with the debug command
      // Use "write text" approach which is more reliable than passing command directly
      const script = `tell application "iTerm2"
        create window with default profile
        tell current session of current window
          write text "${debugCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
        end tell
        activate
      end tell`;
      return {
        command: 'osascript',
        args: ['-e', script],
      };
    }

    case 'terminal': {
      // Default to Terminal.app using osascript
      const script = `tell application "Terminal"
        do script "${debugCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
        activate
      end tell`;
      return {
        command: 'osascript',
        args: ['-e', script],
      };
    }

    case 'alacritty':
    case 'wezterm': {
      return {
        command: terminalApp,
        args: ['-e', 'sh', '-c', debugCommand],
      };
    }

    default: {
      const scriptPath = path.join(CLI_ROOT, 'scripts/dev_start_cli.sh');

      return {
        command: 'open',
        args: ['-a', terminalApp, scriptPath],
      };
    }
  }
}

function getLinuxTerminalConfig(app: string | undefined): TerminalConfig {
  switch (app) {
    case 'gnome-terminal': {
      return {
        command: 'gnome-terminal',
        args: ['--', 'sh', '-c', `${debugCommand}; exec bash`],
      };
    }

    case 'konsole': {
      return {
        command: 'konsole',
        args: ['-e', 'sh', '-c', `${debugCommand}; exec bash`],
      };
    }

    case 'xterm': {
      return {
        command: 'xterm',
        args: ['-e', 'sh', '-c', `${debugCommand}; exec bash`],
      };
    }

    case 'alacritty': {
      return {
        command: 'alacritty',
        args: ['-e', 'sh', '-c', debugCommand],
      };
    }

    case 'kitty': {
      return {
        command: 'kitty',
        args: ['-e', 'sh', '-c', debugCommand],
      };
    }

    case 'ghostty': {
      return {
        command: 'ghostty',
        args: ['-e', 'sh', '-c', debugCommand],
      };
    }

    default: {
      // Try x-terminal-emulator as fallback (Debian/Ubuntu)
      return {
        command: 'x-terminal-emulator',
        args: ['-e', 'sh', '-c', `${debugCommand}; exec bash`],
      };
    }
  }
}

// Get terminal configuration based on platform
let terminalConfig: TerminalConfig;

if (currentPlatform === 'darwin') {
  console.log(`Terminal env var: ${terminalApp}`);
  terminalConfig = getMacOSTerminalConfig(terminalApp);
  console.log(`Config: ${JSON.stringify(terminalConfig)}`);
} else if (currentPlatform === 'linux') {
  terminalConfig = getLinuxTerminalConfig(terminalApp);
} else {
  console.error(`Unsupported platform: ${currentPlatform}`);
  process.exit(1);
}

// Launch the terminal
console.log(`Launching ${terminalApp || 'default terminal'} with debug command...`);
console.log(`Platform: ${currentPlatform}`);
console.log(`Command: ${terminalConfig.command} ${terminalConfig.args.join(' ')}`);

const child = spawn(terminalConfig.command, terminalConfig.args, {
  detached: true,
  stdio: 'ignore',
});

child.unref();

console.log('\n✓ Terminal launched successfully!');
console.log('→ The CLI is waiting for debugger to attach on port 9229');
console.log('→ Use "Attach to CLI" debug configuration in VS Code to connect');

// Give the process a moment to start up before VS Code tries to attach
console.log('→ Waiting for process to initialize...');
// delay before attaching a debuger is required to make sure terminal app is running and the debug command is executed
await new Promise((resolve) => setTimeout(resolve, DEBUGGER_INITIALIZATION_DELAY_MS));
console.log('→ Ready for debugger attachment\n');
