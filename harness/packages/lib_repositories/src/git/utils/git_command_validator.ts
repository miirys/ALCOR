import { parse } from 'shell-quote';

const MAX_ARGS_LENGTH = 1000;
export const MAX_ARGS_STR_TOTAL_BYTES = process.platform === 'win32' ? 30_000 : 1_000_000;

/*
Parses a Git arguments string.
Extracts all argument strings including globs and operators as literals.
@param argsString - Raw argument string (e.g., 'add *.txt')
@returns Array of all parsed arguments to pass to spawn()
*/

export function parseGitArgs(argsString: string): string[] {
  const parsed = parse(argsString);

  return parsed.map((entry) => {
    if (typeof entry === 'string') {
      return entry;
    }

    // Object entries (globs, operators, etc)
    if (typeof entry === 'object' && entry !== null) {
      // Glob pattern: { op: 'glob', pattern: '*.txt' }
      if ('pattern' in entry) {
        return entry.pattern;
      }

      // Operator: { op: '&&' } or { op: '|' }
      if ('op' in entry) {
        return entry.op;
      }
    }

    // Fallback (shouldn't happen with shell-quote)
    return String(entry);
  });
}

export function isArgLengthValid(arg: string): boolean {
  return arg.length <= MAX_ARGS_LENGTH;
}

export function isCommandStrLengthValid(command: string, argsString: string): boolean {
  const commandBytes = Buffer.from(command).length;
  const argsBytes = Buffer.from(argsString).length;

  return commandBytes + argsBytes < MAX_ARGS_STR_TOTAL_BYTES;
}

export function validateGitCommand(command: string, argsString: string = ''): ValidationResult {
  if (!isCommandStrLengthValid(command, argsString)) {
    return {
      isValid: false,
      error: `Command is too long: bytes exceed ${MAX_ARGS_STR_TOTAL_BYTES} byte limit on ${process.platform}`,
    };
  }

  let args: string[];

  try {
    args = parseGitArgs(argsString);
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Failed to parse arguments',
    };
  }

  for (const arg of args) {
    if (!isArgLengthValid(arg)) {
      return {
        isValid: false,
        error: `Argument too long: ${arg.substring(0, 50)}...`,
      };
    }
  }

  return {
    isValid: true,
    args,
  };
}

interface ValidationResult {
  isValid: boolean;
  args?: string[];
  error?: string;
}
