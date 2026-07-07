import { StaticToolProvider } from './static_tool_provider';

describe('StaticToolProvider', () => {
  const provider = new StaticToolProvider();

  describe('getAll', () => {
    it('returns a non-empty array', () => {
      const tools = provider.getAll();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('returns tools from all 6 categories', () => {
      const categories = new Set(provider.getAll().map((t) => t.category));
      expect(categories).toEqual(
        new Set([
          'File System',
          'Git',
          'Testing',
          'GitLab::Context',
          'GitLab::Actions',
          'GitLab::Search',
        ]),
      );
    });

    it('every tool has required fields', () => {
      for (const tool of provider.getAll()) {
        expect(tool.name).toBeTruthy();
        expect(tool.label).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.category).toBeTruthy();
      }
    });

    it('all tool names are unique', () => {
      const names = provider.getAll().map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('get', () => {
    it('returns the expected tool for a known name', () => {
      const tool = provider.get('read_file');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('read_file');
      expect(tool?.category).toBe('File System');
    });

    it('returns undefined for an unknown name', () => {
      expect(provider.get('nonexistent')).toBeUndefined();
    });
  });
});
