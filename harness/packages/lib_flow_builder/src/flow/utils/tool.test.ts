import type { ToolDefinition } from '../registry';
import { groupToolsByCategory, groupToolsByTopCategory } from './tool';

describe('tool utilities', () => {
  describe('category grouping', () => {
    const make = (name: string, category: string): ToolDefinition => ({
      name,
      label: name,
      description: '',
      category,
    });

    const tools: ToolDefinition[] = [
      make('read_file', 'File System'),
      make('write_file', 'File System'),
      make('create_issue', 'GitLab::Issues'),
      make('create_mr', 'GitLab::Merge Requests'),
      make('shell_exec', ''),
    ];

    describe('groupToolsByCategory', () => {
      it('buckets tools by raw category, preserving subLabel', () => {
        const groups = groupToolsByCategory(tools);
        const byKey = new Map(groups.map((g) => [g.key, g]));

        expect(byKey.get('File System')).toMatchObject({
          topLabel: 'File System',
          subLabel: '',
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'read_file' }),
            expect.objectContaining({ name: 'write_file' }),
          ]),
        });
        expect(byKey.get('GitLab::Issues')).toMatchObject({
          topLabel: 'GitLab',
          subLabel: 'Issues',
        });
        expect(byKey.get('GitLab::Merge Requests')).toMatchObject({
          topLabel: 'GitLab',
          subLabel: 'Merge Requests',
        });
      });

      it('falls back to "Other" for tools with no category', () => {
        const groups = groupToolsByCategory(tools);
        expect(groups.find((g) => g.key === 'Other')?.tools).toHaveLength(1);
      });

      it('joins nested subcategories with › separator', () => {
        const groups = groupToolsByCategory([make('deep', 'A::B::C')]);
        expect(groups[0]).toMatchObject({ topLabel: 'A', subLabel: 'B › C' });
      });
    });

    describe('groupToolsByTopCategory', () => {
      it('nests subcategories under each top-level and counts tools', () => {
        const groups = groupToolsByTopCategory(tools);
        const gitlab = groups.find((g) => g.key === 'GitLab');

        expect(gitlab).toBeDefined();
        expect(gitlab?.count).toBe(2);
        expect(gitlab?.subcategories.map((s) => s.label)).toEqual(['Issues', 'Merge Requests']);
      });

      it('returns an empty array for no tools', () => {
        expect(groupToolsByTopCategory([])).toEqual([]);
      });
    });
  });
});
