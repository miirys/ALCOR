import { ZodError } from 'zod';
import { parse } from './parse';

const validSharedOpts: Record<string, unknown> = {
  cwd: '/tmp',
  gitlabBaseUrl: 'https://gitlab.com',
  gitlabAuthToken: 'token-123',
  logLevel: 'debug',
};

describe('parse', () => {
  describe('when given valid tui options', () => {
    it('parses successfully', () => {
      const result = parse(validSharedOpts, 'tui');
      expect(result.command.name).toBe('tui');
      expect(result.cwd).toBe('/tmp');
    });
  });

  describe('when given tui options with existingSessionId', () => {
    it('parses existingSessionId from allOpts', () => {
      const result = parse({ ...validSharedOpts, existingSessionId: 'sess-1' }, 'tui');
      expect(result.command).toEqual({
        name: 'tui',
        existingSessionId: 'sess-1',
        auto: false,
      });
    });
  });

  describe('when given tui options with --auto', () => {
    it('parses auto as true when set', () => {
      const result = parse({ ...validSharedOpts, auto: true }, 'tui');
      expect(result.command.name).toBe('tui');
      if (result.command.name === 'tui') {
        expect(result.command.auto).toBe(true);
      }
    });

    it('defaults auto to false when omitted', () => {
      const result = parse(validSharedOpts, 'tui');
      if (result.command.name === 'tui') {
        expect(result.command.auto).toBe(false);
      }
    });
  });

  describe('when given valid run options', () => {
    it('parses successfully', () => {
      const result = parse({ ...validSharedOpts, goal: 'fix the bug' }, 'run');
      expect(result.command.name).toBe('run');
    });
  });

  describe('when given run options with aiContextItems', () => {
    it('parses the context items', () => {
      const result = parse(
        { ...validSharedOpts, goal: 'do it', aiContextItems: [{ type: 'file', path: 'a.ts' }] },
        'run',
      );
      expect(result.command.name).toBe('run');
    });
  });

  describe('when cwd is missing', () => {
    it('throws a ZodError', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { cwd: _cwd, ...optsWithoutCwd } = validSharedOpts;
      expect(() => parse(optsWithoutCwd, 'tui')).toThrow(ZodError);
    });
  });

  describe('when run command is missing goal', () => {
    it('throws a ZodError', () => {
      expect(() => parse(validSharedOpts, 'run')).toThrow(ZodError);
    });
  });

  describe('when run command has --approval without --existing-session-id', () => {
    it('throws a ZodError', () => {
      expect(() => parse({ ...validSharedOpts, goal: 'do it', approval: 'true' }, 'run')).toThrow(
        ZodError,
      );
    });
  });

  describe('when run command has both --goal and --approval', () => {
    it('parses successfully (goal is always required)', () => {
      const result = parse(
        { ...validSharedOpts, goal: 'do it', approval: 'true', existingSessionId: 'sess-1' },
        'run',
      );
      expect(result.command.name).toBe('run');
      if (result.command.name === 'run') {
        expect(result.command.goal).toBe('do it');
        expect(result.command.approval).toBe('approved');
      }
    });
  });

  describe('when run command has --rejection-reason without --approval', () => {
    it('throws a ZodError', () => {
      expect(() =>
        parse({ ...validSharedOpts, goal: 'do it', rejectionReason: 'bad plan' }, 'run'),
      ).toThrow(ZodError);
    });
  });

  describe('when run command has --rejection-reason with --approval true', () => {
    it('throws a ZodError', () => {
      expect(() =>
        parse(
          {
            ...validSharedOpts,
            goal: 'do it',
            approval: 'true',
            existingSessionId: 'sess-1',
            rejectionReason: 'bad plan',
          },
          'run',
        ),
      ).toThrow(ZodError);
    });
  });

  describe('when run command has valid --approval true with --existing-session-id', () => {
    it('parses successfully with approval transformed to approved', () => {
      const result = parse(
        { ...validSharedOpts, goal: 'do it', approval: 'true', existingSessionId: 'sess-1' },
        'run',
      );
      expect(result.command.name).toBe('run');
      if (result.command.name === 'run') {
        expect(result.command.approval).toBe('approved');
      }
    });
  });

  describe('when run command has valid --approval false with rejection reason', () => {
    it('parses successfully with approval transformed to rejected', () => {
      const result = parse(
        {
          ...validSharedOpts,
          goal: 'do it',
          approval: 'false',
          existingSessionId: 'sess-1',
          rejectionReason: 'bad plan',
        },
        'run',
      );
      expect(result.command.name).toBe('run');
      if (result.command.name === 'run') {
        expect(result.command.approval).toBe('rejected');
        expect(result.command.rejectionReason).toBe('bad plan');
      }
    });
  });

  describe('when run command has --approval once', () => {
    it('transforms to approved', () => {
      const result = parse(
        { ...validSharedOpts, goal: 'do it', approval: 'once', existingSessionId: 'sess-1' },
        'run',
      );
      if (result.command.name === 'run') {
        expect(result.command.approval).toBe('approved');
      }
    });
  });

  describe('when run command has --output-format json', () => {
    it('parses outputFormat as json', () => {
      const result = parse({ ...validSharedOpts, goal: 'do it', outputFormat: 'json' }, 'run');
      expect(result.command.name).toBe('run');
      if (result.command.name === 'run') {
        expect(result.command.outputFormat).toBe('json');
      }
    });
  });

  describe('when run command has --output-format text', () => {
    it('parses outputFormat as text', () => {
      const result = parse({ ...validSharedOpts, goal: 'do it', outputFormat: 'text' }, 'run');
      expect(result.command.name).toBe('run');
      if (result.command.name === 'run') {
        expect(result.command.outputFormat).toBe('text');
      }
    });
  });

  describe('when run command omits --output-format', () => {
    it('defaults outputFormat to text', () => {
      const result = parse({ ...validSharedOpts, goal: 'do it' }, 'run');
      expect(result.command.name).toBe('run');
      if (result.command.name === 'run') {
        expect(result.command.outputFormat).toBe('text');
      }
    });
  });

  describe('when run command has an invalid --output-format', () => {
    it('throws a ZodError', () => {
      expect(() =>
        parse({ ...validSharedOpts, goal: 'do it', outputFormat: 'yaml' }, 'run'),
      ).toThrow(ZodError);
    });
  });

  describe('when optional shared fields are omitted', () => {
    it('parses successfully', () => {
      const result = parse(validSharedOpts, 'tui');
      expect(result.gitHttpUser).toBeUndefined();
      expect(result.gitHttpPassword).toBeUndefined();
    });
  });

  describe('when existingSessionId is provided for run command', () => {
    it('picks it up from allOpts', () => {
      const result = parse(
        { ...validSharedOpts, goal: 'do it', existingSessionId: 'from-command' },
        'run',
      );
      expect(result.command.name).toBe('run');
      if (result.command.name === 'run') {
        expect(result.command.existingSessionId).toBe('from-command');
      }
    });
  });

  describe.each([
    { field: 'dangerouslySkipPermissions', defaultValue: false },
    { field: 'skipTokenCheck', defaultValue: false },
    { field: 'enableProjectHooks', defaultValue: false },
  ] as const)('required boolean option: $field', ({ field, defaultValue }) => {
    it('parses true as true', () => {
      expect(parse({ ...validSharedOpts, [field]: true }, 'tui')[field]).toBe(true);
    });

    it(`defaults to ${defaultValue}`, () => {
      expect(parse(validSharedOpts, 'tui')[field]).toBe(defaultValue);
    });

    it('coerces string "true" to true', () => {
      expect(parse({ ...validSharedOpts, [field]: 'true' }, 'tui')[field]).toBe(true);
    });

    it('coerces string "false" to false', () => {
      expect(parse({ ...validSharedOpts, [field]: 'false' }, 'tui')[field]).toBe(false);
    });

    it('coerces string "0" to false', () => {
      expect(parse({ ...validSharedOpts, [field]: '0' }, 'tui')[field]).toBe(false);
    });
  });

  describe.each([
    { field: 'enableGlobalSkills' },
    { field: 'telemetryEnabled' },
    { field: 'sessionTrackingEnabled' },
    { field: 'sandbox' },
  ] as const)('optional boolean option: $field', ({ field }) => {
    it('parses true as true', () => {
      expect(parse({ ...validSharedOpts, [field]: true }, 'tui')[field]).toBe(true);
    });

    it('defaults to undefined when omitted', () => {
      expect(parse(validSharedOpts, 'tui')[field]).toBeUndefined();
    });

    it('coerces string "true" to true', () => {
      expect(parse({ ...validSharedOpts, [field]: 'true' }, 'tui')[field]).toBe(true);
    });

    it('coerces string "false" to false', () => {
      expect(parse({ ...validSharedOpts, [field]: 'false' }, 'tui')[field]).toBe(false);
    });

    it('coerces string "0" to false', () => {
      expect(parse({ ...validSharedOpts, [field]: '0' }, 'tui')[field]).toBe(false);
    });

    it('treats empty string as undefined', () => {
      expect(parse({ ...validSharedOpts, [field]: '' }, 'tui')[field]).toBeUndefined();
    });

    it('treats null as undefined', () => {
      expect(parse({ ...validSharedOpts, [field]: null }, 'tui')[field]).toBeUndefined();
    });
  });

  describe('when backend-specific fields are provided', () => {
    it('ignores them (backend options are parsed separately)', () => {
      const opts = { ...validSharedOpts, model: 'claude_sonnet_4_6' };
      const result = parse(opts, 'tui');
      expect((result as Record<string, unknown>).model).toBeUndefined();
    });
  });
});
