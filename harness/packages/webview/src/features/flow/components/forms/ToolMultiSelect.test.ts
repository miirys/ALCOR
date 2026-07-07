import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import type { ToolDefinition } from '../../types';
import ToolMultiSelect from './ToolMultiSelect.vue';

const tools: ToolDefinition[] = [
  {
    name: 'read_file',
    label: 'Read File',
    description: 'Reads the contents of a file from disk',
    category: 'File System',
  },
  {
    name: 'write_file',
    label: 'Write File',
    description: 'Writes content to a file on disk',
    category: 'File System',
  },
  {
    name: 'create_issue',
    label: 'Create Issue',
    description: 'Creates a new GitLab issue',
    category: 'GitLab::Issues',
  },
  {
    name: 'create_mr',
    label: 'Create Merge Request',
    description: 'Opens a merge request against a target branch',
    category: 'GitLab::Merge Requests',
  },
];

vi.mock('../../composables/useFlow', () => ({
  useFlow: () => ({
    toolDefinitions: ref(tools),
  }),
}));

async function openDropdown(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('button[aria-expanded]').trigger('click');
  await nextTick();
}

function mountPicker(modelValue: string[] = []) {
  return mount(ToolMultiSelect, {
    attachTo: document.body,
    props: {
      label: 'Toolset',
      modelValue,
    },
  });
}

describe('ToolMultiSelect', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('pills', () => {
    it('renders a pill per selected tool using the catalog label', () => {
      const wrapper = mountPicker(['read_file']);
      expect(wrapper.text()).toContain('Read File');
    });

    it('renders stale pills with an amber warning and the raw name', () => {
      const wrapper = mountPicker(['removed_tool']);
      expect(wrapper.text()).toContain('removed_tool');
      expect(wrapper.html()).toContain('text-amber-600');
    });

    it('shows the trigger CTA when nothing is selected', () => {
      const wrapper = mountPicker([]);
      expect(wrapper.get('button[aria-expanded]').text()).toBe('Add tools');
    });

    it('summarises the selection count on the trigger', () => {
      const one = mountPicker(['read_file']);
      expect(one.get('button[aria-expanded]').text()).toBe('1 tool · Add more');

      const many = mountPicker(['read_file', 'write_file', 'create_issue']);
      expect(many.get('button[aria-expanded]').text()).toBe('3 tools · Add more');
    });

    it('emits modelValue without the removed tool when the X is clicked', async () => {
      const wrapper = mountPicker(['read_file', 'write_file']);
      const removeButton = wrapper.get('button[aria-label="Remove Read File"]');
      await removeButton.trigger('click');

      const events = wrapper.emitted('update:modelValue');
      expect(events).toBeTruthy();
      expect(events?.[0]?.[0]).toEqual(['write_file']);
    });
  });

  describe('dropdown', () => {
    it('opens and lists every catalog tool by default', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      expect(wrapper.text()).toContain('Read File');
      expect(wrapper.text()).toContain('Write File');
      expect(wrapper.text()).toContain('Create Issue');
      expect(wrapper.text()).toContain('Create Merge Request');
    });

    it('groups tools by top-level category with a Lucide category icon', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      const html = wrapper.html();
      // Top-level labels show up in group headers
      expect(html).toContain('File System');
      expect(html).toContain('GitLab');
      // Lucide icon classes appear in the rendered SVGs (one per group header)
      expect(html).toMatch(/lucide-folder-tree-icon/);
      expect(html).toMatch(/lucide-gitlab-icon/);
    });

    it('nests subcategories under their top-level group (matches palette)', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      const html = wrapper.html();
      // GitLab appears once as a top-level header, and Issues / Merge Requests
      // appear as nested sub-headers underneath it — not as sibling top-levels.
      const gitlabHeaderMatches = html.match(/lucide-gitlab-icon/g) ?? [];
      expect(gitlabHeaderMatches.length).toBe(1);
      expect(html).toContain('Issues');
      expect(html).toContain('Merge Requests');
    });

    it('filters by name, label, and description (case-insensitive)', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      const search = wrapper.get('input[placeholder="Search tools..."]');

      await search.setValue('MERGE');
      expect(wrapper.text()).toContain('Create Merge Request');
      expect(wrapper.text()).not.toContain('Read File');

      await search.setValue('file on disk');
      expect(wrapper.text()).toContain('Write File');
      expect(wrapper.text()).not.toContain('Create Issue');

      await search.setValue('read_file');
      expect(wrapper.text()).toContain('Read File');
      expect(wrapper.text()).not.toContain('Write File');
    });

    it('toggles a tool in and out of selection on click', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      const row = wrapper.findAll('[role="option"]').find((b) => b.text().includes('Read File'))!;
      await row.trigger('click');

      const events = wrapper.emitted('update:modelValue');
      expect(events?.[0]?.[0]).toEqual(['read_file']);
    });
  });

  describe('collapsible sections', () => {
    function categoryHeader(wrapper: ReturnType<typeof mount>, label: string) {
      return wrapper
        .findAll('button[aria-expanded][aria-controls]')
        .find((b) => b.text().includes(label))!;
    }

    it('hides a category’s tool rows after its header is clicked', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      expect(wrapper.text()).toContain('Read File');

      await categoryHeader(wrapper, 'File System').trigger('click');

      expect(wrapper.text()).not.toContain('Read File');
      expect(wrapper.text()).not.toContain('Write File');
      // Header + count stay visible so the user can re-open.
      expect(wrapper.text()).toContain('File System');
    });

    it('re-shows rows on a second click', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      const header = categoryHeader(wrapper, 'File System');
      await header.trigger('click');
      await header.trigger('click');

      expect(wrapper.text()).toContain('Read File');
      expect(wrapper.text()).toContain('Write File');
    });

    it('force-expands collapsed groups while a search query is active', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      await categoryHeader(wrapper, 'File System').trigger('click');
      expect(wrapper.text()).not.toContain('Read File');

      await wrapper.get('input[placeholder="Search tools..."]').setValue('read');
      // Match lives inside the collapsed group; search must override collapse.
      expect(wrapper.text()).toContain('Read File');
    });

    it('skips rows in a collapsed group during keyboard nav', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      // Collapse File System so the first navigable row is in GitLab.
      await categoryHeader(wrapper, 'File System').trigger('click');
      await nextTick();

      const active = wrapper.find('[role="option"][data-active="true"]');
      expect(active.exists()).toBe(true);
      expect(active.text()).toContain('Create Issue');
    });
  });

  describe('custom-tool affordance', () => {
    it('is hidden when the query matches an existing tool name exactly', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      await wrapper.get('input[placeholder="Search tools..."]').setValue('read_file');
      expect(wrapper.text()).not.toContain('as custom tool');
    });

    it('is shown when the query substring-matches but has no exact name match', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      await wrapper.get('input[placeholder="Search tools..."]').setValue('read');
      expect(wrapper.text()).toContain('as custom tool');
    });

    it('appends the custom name to modelValue on click', async () => {
      const wrapper = mountPicker(['read_file']);
      await openDropdown(wrapper);

      await wrapper.get('input[placeholder="Search tools..."]').setValue('my_custom_tool');

      const addRow = wrapper
        .findAll('[role="option"]')
        .find((b) => b.text().includes('as custom tool'))!;
      await addRow.trigger('click');

      const events = wrapper.emitted('update:modelValue');
      expect(events?.[0]?.[0]).toEqual(['read_file', 'my_custom_tool']);
    });

    it('is hidden when the custom name is already selected', async () => {
      const wrapper = mountPicker(['already_there']);
      await openDropdown(wrapper);

      await wrapper.get('input[placeholder="Search tools..."]').setValue('already_there');
      expect(wrapper.text()).not.toContain('as custom tool');
    });
  });

  describe('keyboard nav', () => {
    function activeRow(wrapper: ReturnType<typeof mount>) {
      return wrapper.find('[role="option"][data-active="true"]');
    }

    it('highlights the first row when the dropdown opens', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      const active = activeRow(wrapper);
      expect(active.exists()).toBe(true);
      expect(active.attributes('aria-selected')).toBe('false');
      // read_file is the first tool in the first category (File System).
      expect(active.text()).toContain('Read File');
    });

    it('pressing Enter with no prior ArrowDown selects the first row', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      await wrapper.get('.relative').trigger('keydown', { key: 'Enter' });
      const events = wrapper.emitted('update:modelValue');
      expect(events?.[0]?.[0]).toEqual(['read_file']);
    });

    it('ArrowDown advances the active row and Enter toggles it', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      await wrapper.get('.relative').trigger('keydown', { key: 'ArrowDown' });
      expect(activeRow(wrapper).text()).toContain('Write File');

      await wrapper.get('.relative').trigger('keydown', { key: 'ArrowDown' });
      expect(activeRow(wrapper).text()).toContain('Create Issue');

      await wrapper.get('.relative').trigger('keydown', { key: 'Enter' });
      const events = wrapper.emitted('update:modelValue');
      expect(events?.[0]?.[0]).toEqual(['create_issue']);
    });

    it('ArrowUp wraps from the first row to the last', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      await wrapper.get('.relative').trigger('keydown', { key: 'ArrowUp' });
      expect(activeRow(wrapper).text()).toContain('Create Merge Request');
    });

    it('after typing a query, Enter selects the top remaining match', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      await wrapper.get('input[placeholder="Search tools..."]').setValue('merge');
      await nextTick();

      expect(activeRow(wrapper).text()).toContain('Create Merge Request');

      await wrapper.get('.relative').trigger('keydown', { key: 'Enter' });
      const events = wrapper.emitted('update:modelValue');
      expect(events?.[0]?.[0]).toEqual(['create_mr']);
    });

    it('Enter activates the custom-tool row when it is highlighted', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      await wrapper.get('input[placeholder="Search tools..."]').setValue('totally_new_name');
      await nextTick();

      const active = activeRow(wrapper);
      expect(active.text()).toContain('as custom tool');

      await wrapper.get('.relative').trigger('keydown', { key: 'Enter' });
      const events = wrapper.emitted('update:modelValue');
      expect(events?.[0]?.[0]).toEqual(['totally_new_name']);
    });

    it('closes the dropdown on Escape', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      expect(wrapper.find('input[placeholder="Search tools..."]').exists()).toBe(true);

      await wrapper.get('.relative').trigger('keydown', { key: 'Escape' });
      await nextTick();

      expect(wrapper.find('input[placeholder="Search tools..."]').exists()).toBe(false);
    });
  });

  describe('visual state', () => {
    it('marks the keyboard-active row with a primary left border', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      const active = wrapper.find('[role="option"][data-active="true"]');
      expect(active.exists()).toBe(true);
      expect(active.classes()).toContain('border-l-primary');
    });

    it('tints selected rows with a primary background', async () => {
      const wrapper = mountPicker(['write_file']);
      await openDropdown(wrapper);

      // Move past the auto-highlighted first row so write_file is styled as
      // "selected but not active".
      await wrapper.get('.relative').trigger('keydown', { key: 'ArrowDown' });
      await wrapper.get('.relative').trigger('keydown', { key: 'ArrowDown' });

      const writeRow = wrapper.find('[role="option"][data-selected="true"]');
      expect(writeRow.exists()).toBe(true);
      expect(writeRow.attributes('data-active')).toBe('false');
      expect(writeRow.classes()).toContain('bg-primary/5');
    });

    it('wires the combobox to the active option via aria-activedescendant', async () => {
      const wrapper = mountPicker();
      await openDropdown(wrapper);

      const input = wrapper.get('input[role="combobox"]');
      const active = wrapper.get('[role="option"][data-active="true"]');
      expect(input.attributes('aria-activedescendant')).toBe(active.attributes('id'));
    });
  });
});
