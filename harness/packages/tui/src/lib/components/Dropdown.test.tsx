import React from 'react';
import { Text } from 'ink';
import { describe, it, expect, jest } from '@jest/globals';
import { renderWithProviders } from '../../test/render_helper';
import { Dropdown } from './Dropdown';

const renderDropdown = <T extends unknown>(props: {
  items: T[];
  selectedIndex: number;
  getKey: (item: T) => string | number;
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  maxVisible?: number;
}) => {
  return renderWithProviders(<Dropdown {...props} />);
};

describe('Dropdown', () => {
  describe('empty state', () => {
    it('should display "No results found" when items array is empty', () => {
      const { lastFrame } = renderDropdown({
        items: [],
        selectedIndex: 0,
        getKey: (item: string) => item,
        renderItem: (item: string) => <>{item}</>,
      });

      const output = lastFrame();
      expect(output).toContain('No results found');
    });

    it('should not display items when array is empty', () => {
      const { lastFrame } = renderDropdown({
        items: [],
        selectedIndex: 0,
        getKey: (item: string) => item,
        renderItem: (item: string) => <>{item}</>,
      });

      const output = lastFrame();
      expect(output).not.toContain('item1');
    });
  });

  describe('rendering', () => {
    it('should render all items', () => {
      const { lastFrame } = renderDropdown({
        items: ['item1', 'item2', 'item3'],
        selectedIndex: 0,
        getKey: (item: string) => item,
        renderItem: (item: string) => <Text>{item}</Text>,
      });

      const output = lastFrame();
      expect(output).toContain('item1');
      expect(output).toContain('item2');
      expect(output).toContain('item3');
    });

    it('should highlight the item at selectedIndex', () => {
      const { lastFrame } = renderDropdown({
        items: ['item1', 'item2', 'item3'],
        selectedIndex: 1,
        getKey: (item: string) => item,
        renderItem: (item: string, isSelected: boolean) => (
          <Text>{isSelected ? `[${item}]` : item}</Text>
        ),
      });

      const output = lastFrame();
      expect(output).toContain('[item2]');
      expect(output).not.toContain('[item1]');
    });

    it('should clamp an out-of-range selectedIndex to the last item', () => {
      const { lastFrame } = renderDropdown({
        items: ['item1', 'item2'],
        selectedIndex: 5,
        getKey: (item: string) => item,
        renderItem: (item: string, isSelected: boolean) => (
          <Text>{isSelected ? `[${item}]` : item}</Text>
        ),
      });

      const output = lastFrame();
      expect(output).toContain('[item2]');
    });

    it('should use getKey for React keys', () => {
      const getKey = jest.fn((item: { id: number; name: string }) => item.id);

      renderDropdown({
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
        ],
        selectedIndex: 0,
        getKey,
        renderItem: (item) => <Text>{item.name}</Text>,
      });

      expect(getKey).toHaveBeenCalledWith({ id: 1, name: 'first' });
      expect(getKey).toHaveBeenCalledWith({ id: 2, name: 'second' });
    });
  });

  describe('scroll windowing', () => {
    const manyItems = Array.from({ length: 15 }, (_, i) => `item${i + 1}`);

    it('should only render maxVisible items when list exceeds the limit', () => {
      const { lastFrame } = renderDropdown({
        items: manyItems,
        selectedIndex: 0,
        getKey: (item: string) => item,
        renderItem: (item: string) => <Text>{item}</Text>,
        maxVisible: 5,
      });

      const output = lastFrame() ?? '';
      // First 5 items visible
      expect(output).toContain('item1');
      expect(output).toContain('item5');
      // Items beyond the window are hidden
      expect(output).not.toMatch(/\bitem6\b/);
    });

    it('should show ▼ indicator when there are items below the window', () => {
      const { lastFrame } = renderDropdown({
        items: manyItems,
        selectedIndex: 0,
        getKey: (item: string) => item,
        renderItem: (item: string) => <Text>{item}</Text>,
        maxVisible: 5,
      });

      expect(lastFrame()).toContain('▼');
    });

    it('should show ▲ indicator when there are items above the window', () => {
      const { lastFrame } = renderDropdown({
        items: manyItems,
        selectedIndex: 14,
        getKey: (item: string) => item,
        renderItem: (item: string) => <Text>{item}</Text>,
        maxVisible: 5,
      });

      expect(lastFrame()).toContain('▲');
    });

    it('should scroll the window to keep the selected item visible', () => {
      const { lastFrame } = renderDropdown({
        items: manyItems,
        selectedIndex: 12,
        getKey: (item: string) => item,
        renderItem: (item: string, isSelected: boolean) => (
          <Text>{isSelected ? `[${item}]` : item}</Text>
        ),
        maxVisible: 5,
      });

      const output = lastFrame() ?? '';
      expect(output).toContain('[item13]');
      // item1 (the very first item) should not be in the window
      expect(output).not.toMatch(/\bitem1\b/);
    });
  });
});
