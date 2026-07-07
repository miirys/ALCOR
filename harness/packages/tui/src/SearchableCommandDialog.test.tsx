import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { SlashCommand } from './types';
import type { SearchableCommandDialogCallbacks } from './SearchableCommandDialog';
import { SearchableCommandDialog } from './SearchableCommandDialog';
import { renderWithProviders } from './test/render_helper';

const items: SlashCommand[] = [
  { name: 'cli-development', description: 'Build and test the Duo CLI' },
  { name: 'review-mr', description: 'Review a merge request end to end' },
];

const renderDialog = (itemList: SlashCommand[], callbacks: SearchableCommandDialogCallbacks) =>
  renderWithProviders(
    <SearchableCommandDialog
      items={itemList}
      placeholder="Type to filter..."
      emptyText="No items are available."
      noMatchesText="No matching items"
      callbacks={callbacks}
    />,
  );

const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('SearchableCommandDialog', () => {
  let callbacks: SearchableCommandDialogCallbacks;

  beforeEach(() => {
    callbacks = createFakePartial<SearchableCommandDialogCallbacks>({
      onClose: jest.fn(),
      onSelect: jest.fn(),
    });
  });

  it('renders all item names and descriptions', () => {
    const { lastFrame } = renderDialog(items, callbacks);
    const output = lastFrame();
    expect(output).toContain('cli-development');
    expect(output).toContain('Build and test the Duo CLI');
    expect(output).toContain('review-mr');
  });

  it('selects the highlighted (first) item on Enter', () => {
    const { sendInput } = renderDialog(items, callbacks);
    sendInput('', { return: true });
    expect(callbacks.onSelect).toHaveBeenCalledWith('cli-development');
  });

  it('closes on Escape', () => {
    const { sendInput } = renderDialog(items, callbacks);
    sendInput('', { escape: true });
    expect(callbacks.onClose).toHaveBeenCalled();
  });

  it('filters the list as you type', async () => {
    const { sendInput, lastFrame } = renderDialog(items, callbacks);
    sendInput('review');
    await tick();
    const output = lastFrame();
    expect(output).toContain('review-mr');
    expect(output).not.toContain('cli-development');
  });

  it('shows the no-matches empty state when the filter matches nothing', async () => {
    const { sendInput, lastFrame } = renderDialog(items, callbacks);
    sendInput('zzz-nonexistent');
    await tick();
    expect(lastFrame()).toContain('No matching items');
  });

  it('shows the no-items empty state when there are no items', () => {
    const { lastFrame } = renderDialog([], callbacks);
    expect(lastFrame()).toContain('No items are available.');
  });
});
