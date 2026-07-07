import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useToolInfo } from './useToolInfo';

describe('useToolInfo', () => {
  describe('when toolInfoJson is null', () => {
    it('returns null for toolInfo', () => {
      const { toolInfo } = useToolInfo(ref(null));
      expect(toolInfo.value).toBeNull();
    });

    it('returns empty string for toolLabel', () => {
      const { toolLabel } = useToolInfo(ref(null));
      expect(toolLabel.value).toBe('');
    });
  });

  describe('when toolInfoJson is undefined', () => {
    it('returns null for toolInfo', () => {
      const { toolInfo } = useToolInfo(ref(undefined));
      expect(toolInfo.value).toBeNull();
    });
  });

  describe('when toolInfoJson is invalid JSON', () => {
    it('returns null for toolInfo', () => {
      const { toolInfo } = useToolInfo(ref('not-json'));
      expect(toolInfo.value).toBeNull();
    });
  });

  describe('when toolInfoJson has no name field', () => {
    it('returns null for toolInfo', () => {
      const { toolInfo } = useToolInfo(ref(JSON.stringify({ args: { foo: 'bar' } })));
      expect(toolInfo.value).toBeNull();
    });
  });

  describe('when toolInfoJson is valid', () => {
    it('parses tool name into toolInfo.tool', () => {
      const { toolInfo } = useToolInfo(ref(JSON.stringify({ name: 'read_file', args: {} })));
      expect(toolInfo.value?.tool).toBe('read_file');
    });

    it('parses args into toolInfo.toolArgs', () => {
      const { toolInfo } = useToolInfo(
        ref(JSON.stringify({ name: 'read_file', args: { file_path: 'src/foo.ts' } })),
      );
      expect(toolInfo.value?.toolArgs).toEqual({ file_path: 'src/foo.ts' });
    });

    it('defaults toolArgs to empty object when args is missing', () => {
      const { toolInfo } = useToolInfo(ref(JSON.stringify({ name: 'read_file' })));
      expect(toolInfo.value?.toolArgs).toEqual({});
    });

    it('parses tool_response into toolInfo.toolResponse', () => {
      const { toolInfo } = useToolInfo(
        ref(JSON.stringify({ name: 'read_file', args: {}, tool_response: { status: 'success' } })),
      );
      expect(toolInfo.value?.toolResponse).toEqual({ status: 'success' });
    });

    it('defaults toolResponse to null when tool_response is missing', () => {
      const { toolInfo } = useToolInfo(ref(JSON.stringify({ name: 'read_file', args: {} })));
      expect(toolInfo.value?.toolResponse).toBeNull();
    });
  });

  describe('toolLabel', () => {
    it('replaces underscores with spaces', () => {
      const { toolLabel } = useToolInfo(ref(JSON.stringify({ name: 'read_file', args: {} })));
      expect(toolLabel.value).toBe('read file');
    });

    it('handles tool names with multiple underscores', () => {
      const { toolLabel } = useToolInfo(ref(JSON.stringify({ name: 'run_git_command', args: {} })));
      expect(toolLabel.value).toBe('run git command');
    });

    it('returns empty string when toolInfo is null', () => {
      const { toolLabel } = useToolInfo(ref(null));
      expect(toolLabel.value).toBe('');
    });
  });

  describe('reactivity', () => {
    it('updates toolInfo when the ref value changes', () => {
      const json = ref<string | null>(null);
      const { toolInfo } = useToolInfo(json);

      expect(toolInfo.value).toBeNull();

      json.value = JSON.stringify({ name: 'read_file', args: {} });
      expect(toolInfo.value?.tool).toBe('read_file');
    });
  });
});
