import { Command } from 'commander';
import { z } from 'zod';
import {
  registerOptionsOnCommand,
  zodShapeFromDefMap,
  type OptionDef,
  type OptionDefMap,
} from './option_def';

describe('option_def', () => {
  describe('registerOptionsOnCommand', () => {
    describe('when given an array of OptionDefs', () => {
      it('registers all options on the command', () => {
        const command = new Command();
        const defs: OptionDef[] = [
          { flags: '--foo <value>', description: 'foo option', default: 'bar' },
          {
            flags: '--baz <value>',
            description: 'baz option',
            env: 'BAZ_ENV',
            choices: ['a', 'b'],
          },
        ];

        registerOptionsOnCommand(command, defs);

        const { options } = command;
        expect(options).toHaveLength(2);
        expect(options[0].long).toBe('--foo');
        expect(options[0].defaultValue).toBe('bar');
        expect(options[1].long).toBe('--baz');
        expect(options[1].envVar).toBe('BAZ_ENV');
      });
    });

    describe('when given an OptionDefMap', () => {
      it('registers all options on the command', () => {
        const command = new Command();
        const defs: OptionDefMap = {
          alpha: { flags: '--alpha <value>', description: 'alpha' },
          beta: { flags: '--beta <value>', description: 'beta', default: 42 },
        };

        registerOptionsOnCommand(command, defs);

        const { options } = command;
        expect(options).toHaveLength(2);
        expect(options[0].long).toBe('--alpha');
        expect(options[1].long).toBe('--beta');
        expect(options[1].defaultValue).toBe(42);
      });
    });

    describe('when an option has a parse function', () => {
      it('uses the parse function as argParser', () => {
        const command = new Command();
        command.exitOverride();
        const defs: OptionDef[] = [
          { flags: '--num <value>', description: 'number', parse: (v: string) => parseInt(v, 10) },
        ];

        registerOptionsOnCommand(command, defs);
        command.parse(['--num', '42'], { from: 'user' });

        expect(command.opts().num).toBe(42);
      });
    });

    describe('when an option has hidden: true', () => {
      it('hides the option from help output', () => {
        const command = new Command();
        const defs: OptionDef[] = [
          { flags: '--secret', description: 'hidden option', hidden: true },
        ];

        registerOptionsOnCommand(command, defs);

        const { options } = command;
        expect(options).toHaveLength(1);
        expect(options[0].hidden).toBe(true);
      });
    });

    describe('when an option does not have hidden set', () => {
      it('does not hide the option from help output', () => {
        const command = new Command();
        const defs: OptionDef[] = [{ flags: '--visible', description: 'visible option' }];

        registerOptionsOnCommand(command, defs);

        const { options } = command;
        expect(options).toHaveLength(1);
        expect(options[0].hidden).toBe(false);
      });
    });
  });

  describe('zodShapeFromDefMap', () => {
    describe('when given defs with and without zod fields', () => {
      it('returns only the entries that have zod schemas', () => {
        const defs = {
          withZod: { flags: '--with-zod <v>', description: 'has zod', zod: z.string() },
          withoutZod: { flags: '--without-zod <v>', description: 'no zod' },
          anotherZod: { flags: '--another <v>', description: 'also zod', zod: z.number() },
        } satisfies OptionDefMap;

        const shape = zodShapeFromDefMap(defs);

        expect(shape).toHaveProperty('withZod');
        expect(shape).toHaveProperty('anotherZod');
        expect(shape).not.toHaveProperty('withoutZod');
      });
    });

    describe('when given an empty map', () => {
      it('returns an empty shape', () => {
        const shape = zodShapeFromDefMap({});
        expect(Object.keys(shape)).toHaveLength(0);
      });
    });
  });
});
