import { deepCamelCaseKeys, deepSnakeCaseKeys } from './object_key_transforms';

describe('deepCamelCaseKeys', () => {
  describe('primitive values', () => {
    it.each([
      { description: 'strings', input: 'hello_world', expected: 'hello_world' },
      { description: 'integers', input: 42, expected: 42 },
      { description: 'floats', input: 3.14, expected: 3.14 },
      { description: 'true boolean', input: true, expected: true },
      { description: 'false boolean', input: false, expected: false },
      { description: 'null', input: null, expected: null },
      { description: 'undefined', input: undefined, expected: undefined },
    ])('should return $description unchanged', ({ input, expected }) => {
      expect(deepCamelCaseKeys(input)).toBe(expected);
    });
  });

  describe('plain objects', () => {
    describe('when given snake_case keys', () => {
      let result: unknown;

      beforeEach(() => {
        const input = {
          user_name: 'john',
          user_id: 123,
          is_active: true,
        };
        result = deepCamelCaseKeys(input);
      });

      it('should transform keys to camelCase', () => {
        expect(result).toEqual({
          userName: 'john',
          userId: 123,
          isActive: true,
        });
      });
    });

    describe('when given already camelCase keys', () => {
      let result: unknown;

      beforeEach(() => {
        const input = {
          userName: 'john',
          userId: 123,
          isActive: true,
        };
        result = deepCamelCaseKeys(input);
      });

      it('should leave keys unchanged', () => {
        expect(result).toEqual({
          userName: 'john',
          userId: 123,
          isActive: true,
        });
      });
    });

    describe('when given mixed key formats', () => {
      let result: unknown;

      beforeEach(() => {
        const input = {
          user_name: 'john',
          userId: 123,
          'kebab-case': 'value',
          PascalCase: 'value',
          UPPER_SNAKE: 'value',
        };
        result = deepCamelCaseKeys(input);
      });

      it('should normalize all keys to camelCase', () => {
        expect(result).toEqual({
          userName: 'john',
          userId: 123,
          kebabCase: 'value',
          pascalCase: 'value',
          upperSnake: 'value',
        });
      });
    });

    describe('when given empty objects', () => {
      let result: unknown;

      beforeEach(() => {
        result = deepCamelCaseKeys({});
      });

      it('should return empty object', () => {
        expect(result).toEqual({});
      });
    });

    describe('when given nested objects', () => {
      let result: unknown;

      beforeEach(() => {
        const input = {
          user_profile: {
            first_name: 'john',
            last_name: 'doe',
            contact_info: {
              email_address: 'john@example.com',
              phone_number: '123-456-7890',
            },
          },
        };
        result = deepCamelCaseKeys(input);
      });

      it('should transform keys at all nesting levels', () => {
        expect(result).toEqual({
          userProfile: {
            firstName: 'john',
            lastName: 'doe',
            contactInfo: {
              emailAddress: 'john@example.com',
              phoneNumber: '123-456-7890',
            },
          },
        });
      });
    });
  });

  describe('arrays', () => {
    describe('when given arrays containing objects', () => {
      let result: unknown;

      beforeEach(() => {
        const input = [
          { user_name: 'john', user_id: 1 },
          { user_name: 'jane', user_id: 2 },
        ];
        result = deepCamelCaseKeys(input);
      });

      it('should transform object keys within arrays', () => {
        expect(result).toEqual([
          { userName: 'john', userId: 1 },
          { userName: 'jane', userId: 2 },
        ]);
      });
    });

    describe('when given arrays of primitives', () => {
      let result: unknown;

      beforeEach(() => {
        const input = ['hello_world', 123, true, null];
        result = deepCamelCaseKeys(input);
      });

      it('should leave primitives unchanged', () => {
        expect(result).toEqual(['hello_world', 123, true, null]);
      });
    });

    describe('when given nested arrays', () => {
      let result: unknown;

      beforeEach(() => {
        const input = [
          [
            { item_name: 'item1', item_value: 100 },
            { item_name: 'item2', item_value: 200 },
          ],
          [{ item_name: 'item3', item_value: 300 }],
        ];
        result = deepCamelCaseKeys(input);
      });

      it('should transform objects at all nesting levels', () => {
        expect(result).toEqual([
          [
            { itemName: 'item1', itemValue: 100 },
            { itemName: 'item2', itemValue: 200 },
          ],
          [{ itemName: 'item3', itemValue: 300 }],
        ]);
      });
    });

    describe('when given empty arrays', () => {
      let result: unknown;

      beforeEach(() => {
        result = deepCamelCaseKeys([]);
      });

      it('should return empty array', () => {
        expect(result).toEqual([]);
      });
    });
  });
});

describe('deepSnakeCaseKeys', () => {
  describe('primitive values', () => {
    it.each([
      { description: 'strings', input: 'helloWorld', expected: 'helloWorld' },
      { description: 'integers', input: 42, expected: 42 },
      { description: 'floats', input: 3.14, expected: 3.14 },
      { description: 'true boolean', input: true, expected: true },
      { description: 'false boolean', input: false, expected: false },
      { description: 'null', input: null, expected: null },
      { description: 'undefined', input: undefined, expected: undefined },
    ])('should return $description unchanged', ({ input, expected }) => {
      expect(deepSnakeCaseKeys(input)).toBe(expected);
    });
  });

  describe('plain objects', () => {
    describe('when given camelCase keys', () => {
      let result: unknown;

      beforeEach(() => {
        const input = {
          userName: 'john',
          userId: 123,
          isActive: true,
        };
        result = deepSnakeCaseKeys(input);
      });

      it('should transform keys to snake_case', () => {
        expect(result).toEqual({
          user_name: 'john',
          user_id: 123,
          is_active: true,
        });
      });
    });

    describe('when given already snake_case keys', () => {
      let result: unknown;

      beforeEach(() => {
        const input = {
          user_name: 'john',
          user_id: 123,
          is_active: true,
        };
        result = deepSnakeCaseKeys(input);
      });

      it('should leave keys unchanged', () => {
        expect(result).toEqual({
          user_name: 'john',
          user_id: 123,
          is_active: true,
        });
      });
    });

    describe('when given mixed key formats', () => {
      let result: unknown;

      beforeEach(() => {
        const input = {
          userName: 'john',
          user_id: 123,
          'kebab-case': 'value',
          PascalCase: 'value',
          UPPER_CASE: 'value',
        };
        result = deepSnakeCaseKeys(input);
      });

      it('should normalize all keys to snake_case', () => {
        expect(result).toEqual({
          user_name: 'john',
          user_id: 123,
          kebab_case: 'value',
          pascal_case: 'value',
          upper_case: 'value',
        });
      });
    });

    describe('when given empty objects', () => {
      let result: unknown;

      beforeEach(() => {
        result = deepSnakeCaseKeys({});
      });

      it('should return empty object', () => {
        expect(result).toEqual({});
      });
    });

    describe('when given nested objects', () => {
      let result: unknown;

      beforeEach(() => {
        const input = {
          userProfile: {
            firstName: 'john',
            lastName: 'doe',
            contactInfo: {
              emailAddress: 'john@example.com',
              phoneNumber: '123-456-7890',
            },
          },
        };
        result = deepSnakeCaseKeys(input);
      });

      it('should transform keys at all nesting levels', () => {
        expect(result).toEqual({
          user_profile: {
            first_name: 'john',
            last_name: 'doe',
            contact_info: {
              email_address: 'john@example.com',
              phone_number: '123-456-7890',
            },
          },
        });
      });
    });

    describe('when given shell context structure', () => {
      let result: unknown;

      beforeEach(() => {
        const input = {
          shellName: 'bash',
          shellType: 'unix',
          shellVariant: 'Git Bash',
          shellEnvironment: 'wsl',
          sshSession: true,
          cwd: '/home/user',
        };
        result = deepSnakeCaseKeys(input);
      });

      it('should transform shell context to snake_case for DWS', () => {
        expect(result).toEqual({
          shell_name: 'bash',
          shell_type: 'unix',
          shell_variant: 'Git Bash',
          shell_environment: 'wsl',
          ssh_session: true,
          cwd: '/home/user',
        });
      });
    });
  });

  describe('arrays', () => {
    describe('when given arrays containing objects', () => {
      let result: unknown;

      beforeEach(() => {
        const input = [
          { userName: 'john', userId: 1 },
          { userName: 'jane', userId: 2 },
        ];
        result = deepSnakeCaseKeys(input);
      });

      it('should transform object keys within arrays', () => {
        expect(result).toEqual([
          { user_name: 'john', user_id: 1 },
          { user_name: 'jane', user_id: 2 },
        ]);
      });
    });

    describe('when given arrays of primitives', () => {
      let result: unknown;

      beforeEach(() => {
        const input = ['helloWorld', 123, true, null];
        result = deepSnakeCaseKeys(input);
      });

      it('should leave primitives unchanged', () => {
        expect(result).toEqual(['helloWorld', 123, true, null]);
      });
    });

    describe('when given nested arrays', () => {
      let result: unknown;

      beforeEach(() => {
        const input = [
          [
            { itemName: 'item1', itemValue: 100 },
            { itemName: 'item2', itemValue: 200 },
          ],
          [{ itemName: 'item3', itemValue: 300 }],
        ];
        result = deepSnakeCaseKeys(input);
      });

      it('should transform objects at all nesting levels', () => {
        expect(result).toEqual([
          [
            { item_name: 'item1', item_value: 100 },
            { item_name: 'item2', item_value: 200 },
          ],
          [{ item_name: 'item3', item_value: 300 }],
        ]);
      });
    });

    describe('when given empty arrays', () => {
      let result: unknown;

      beforeEach(() => {
        result = deepSnakeCaseKeys([]);
      });

      it('should return empty array', () => {
        expect(result).toEqual([]);
      });
    });
  });

  describe('round-trip transformation', () => {
    it('should preserve data when transforming camelCase -> snake_case -> camelCase', () => {
      const original = {
        userName: 'john',
        userProfile: {
          firstName: 'John',
          lastName: 'Doe',
          contactInfo: {
            emailAddress: 'john@example.com',
          },
        },
        userRoles: [
          { roleName: 'admin', roleId: 1 },
          { roleName: 'user', roleId: 2 },
        ],
      };

      const snakeCased = deepSnakeCaseKeys(original);
      const backToCamel = deepCamelCaseKeys(snakeCased);

      expect(backToCamel).toEqual(original);
    });

    it('should preserve data when transforming snake_case -> camelCase -> snake_case', () => {
      const original = {
        user_name: 'john',
        user_profile: {
          first_name: 'John',
          last_name: 'Doe',
          contact_info: {
            email_address: 'john@example.com',
          },
        },
        user_roles: [
          { role_name: 'admin', role_id: 1 },
          { role_name: 'user', role_id: 2 },
        ],
      };

      const camelCased = deepCamelCaseKeys(original);
      const backToSnake = deepSnakeCaseKeys(camelCased);

      expect(backToSnake).toEqual(original);
    });
  });

  describe('edge cases', () => {
    it('should handle objects with numeric keys', () => {
      const input = {
        userName: 'john',
        123: 'numeric key',
      };

      const result = deepSnakeCaseKeys(input);

      expect(result).toEqual({
        user_name: 'john',
        123: 'numeric key',
      });
    });

    it('should handle objects with special characters in values', () => {
      const input = {
        userName: 'john_doe',
        userEmail: 'john@example.com',
        userPath: '/home/user_name/documents',
      };

      const result = deepSnakeCaseKeys(input);

      expect(result).toEqual({
        user_name: 'john_doe',
        user_email: 'john@example.com',
        user_path: '/home/user_name/documents',
      });
    });

    it('should handle deeply nested structures', () => {
      const input = {
        levelOne: {
          levelTwo: {
            levelThree: {
              levelFour: {
                deepValue: 'test',
              },
            },
          },
        },
      };

      const result = deepSnakeCaseKeys(input);

      expect(result).toEqual({
        level_one: {
          level_two: {
            level_three: {
              level_four: {
                deep_value: 'test',
              },
            },
          },
        },
      });
    });

    it('should handle mixed arrays and objects', () => {
      const input = {
        userList: [
          {
            userName: 'john',
            userTags: ['admin', 'developer'],
            userMetadata: {
              lastLogin: '2023-01-01',
            },
          },
        ],
      };

      const result = deepSnakeCaseKeys(input);

      expect(result).toEqual({
        user_list: [
          {
            user_name: 'john',
            user_tags: ['admin', 'developer'],
            user_metadata: {
              last_login: '2023-01-01',
            },
          },
        ],
      });
    });
  });
});
