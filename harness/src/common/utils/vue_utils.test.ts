import { extractScript } from './vue_utils';

const JS_CONTENT = `
  const users = [{ id: 1, name: 'Alice' }];
  export default {
    data() {
      return { users }
    },
    methods: {
      addUser(newUser) { this.users.push(newUser); }
    }
  }
`;

const TS_CONTENT = `
  interface User { id: number; name: string; }
  const users: User[] = [{ id: 1, name: 'Alice' }];
  export default {
    data() {
      return { users }
    },
    methods: {
      addUser(newUser: User): void { this.users.push(newUser); }
    }
  }
`;

describe('extractScript', () => {
  it('returns undefined when no script tag is found', () => {
    const content = '<template><div>No script here</div></template>';
    const result = extractScript(content);
    expect(result).toBeUndefined();
  });

  it('extracts script content from a Vue file', () => {
    const content = `
    <template>
      <div>Hello</div>
    </template>
    <script>${JS_CONTENT}</script>
    `;
    const result = extractScript(content);
    expect(result).toEqual({
      scriptContent: JS_CONTENT,
      scriptStartCharacter: 67,
      scriptStartLine: 4,
      language: 'js',
    });
  });

  it('handles script with lang attribute', () => {
    const content = `<script lang="ts">${TS_CONTENT}</script>`;
    const result = extractScript(content);
    expect(result).toEqual({
      scriptContent: TS_CONTENT,
      scriptStartCharacter: 18,
      scriptStartLine: 0,
      language: 'ts',
    });
  });

  it('handles script tag with multiple attributes', () => {
    const content = `<script setup lang="ts">${TS_CONTENT}</script>`;
    const result = extractScript(content);
    expect(result).toEqual({
      scriptContent: TS_CONTENT,
      scriptStartCharacter: 24,
      scriptStartLine: 0,
      language: 'ts',
    });
  });
});
