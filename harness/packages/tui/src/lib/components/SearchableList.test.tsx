import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { Text } from 'ink';
import { renderWithProviders } from '../../test/render_helper';
import { SearchableList } from './SearchableList';

interface Item {
  id: string;
  label: string;
}

const createItems = (count: number): Item[] =>
  Array.from({ length: count }, (_, i) => ({ id: `id-${i}`, label: `item-${i}` }));

// Bold left-border glyph rendered by the separator Box (borderStyle="bold").
const SEPARATOR_GLYPH = '┃';

// A borderless item renderer so the only source of border glyphs in a frame
// is the separator Box itself (the default item renderer also draws a border).
function PlainItem({ item }: { item: Item; isSelected: boolean }) {
  return <Text>{item.label}</Text>;
}

const renderList = (props: Partial<React.ComponentProps<typeof SearchableList<Item>>> = {}) =>
  renderWithProviders(
    <SearchableList<Item>
      items={createItems(3)}
      getItemKey={(item) => item.id}
      ItemComponent={PlainItem}
      placeholder="Search..."
      onSearchChange={jest.fn()}
      emptyText="No results"
      onSelect={jest.fn()}
      onCancel={jest.fn()}
      {...props}
    />,
  );

describe('SearchableList', () => {
  describe('separators', () => {
    it('renders separators between items by default', () => {
      const { lastFrame } = renderList({ items: createItems(3) });
      const output = lastFrame() ?? '';

      const separatorRows = output.split('\n').filter((line) => line.includes(SEPARATOR_GLYPH));

      // 3 items => 2 separators between them.
      expect(separatorRows).toHaveLength(2);
    });

    it('does not render a trailing separator after the last item', () => {
      const { lastFrame } = renderList({ items: createItems(3) });
      const lines = (lastFrame() ?? '').split('\n');

      const lastItemLine = lines.findIndex((line) => line.includes('item-2'));
      const trailingLines = lines.slice(lastItemLine + 1);

      expect(trailingLines.some((line) => line.includes(SEPARATOR_GLYPH))).toBe(false);
    });

    it('does not render separators when showSeparators is false', () => {
      const { lastFrame } = renderList({ items: createItems(3), showSeparators: false });
      const output = lastFrame() ?? '';

      expect(output).not.toContain(SEPARATOR_GLYPH);
      // Items are still rendered.
      expect(output).toContain('item-0');
      expect(output).toContain('item-2');
    });
  });

  describe('scroll indicators', () => {
    it('renders the scroll-down arrow when there are more items than fit the window', () => {
      const { lastFrame } = renderList({ items: createItems(20), maxVisible: 5 });
      const output = lastFrame() ?? '';

      expect(output).toContain('▼');
    });

    it('does not render arrows when all items fit, but still reserves the indicator rows', () => {
      const { lastFrame } = renderList({ items: createItems(3), maxVisible: 10 });
      const lines = (lastFrame() ?? '').split('\n');

      const output = lines.join('\n');
      expect(output).not.toContain('▲');
      expect(output).not.toContain('▼');

      // The indicator rows are always rendered as blank reserved rows: one sits
      // directly above the first item and one below the last item, so the list
      // does not shift between the scrollable and non-scrollable states. These
      // assertions fail if the rows are reverted to conditionally-rendered arrows.
      const firstItemLine = lines.findIndex((line) => line.includes('item-0'));
      const lastItemLine = lines.findIndex((line) => line.includes('item-2'));

      expect(firstItemLine).toBeGreaterThan(0);
      expect(lastItemLine).toBeGreaterThan(firstItemLine);

      // Reserved blank ▲ row: exactly one line between the first item and
      // whatever renders above it (the search input), and it is blank.
      const reservedUpLine = firstItemLine - 1;
      expect(reservedUpLine).toBeGreaterThan(0);
      expect(lines[reservedUpLine].trim()).toBe('');

      // Reserved blank ▼ row: a blank line sits immediately after the last item.
      const reservedDownLine = lastItemLine + 1;
      expect(lines[reservedDownLine].trim()).toBe('');
    });
  });
});
