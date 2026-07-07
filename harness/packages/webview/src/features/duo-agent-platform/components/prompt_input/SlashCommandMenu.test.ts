import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { GitlabChatSlashCommand } from '../../utils/slashCommands.ts';
import SlashCommandMenu from './SlashCommandMenu.vue';

const commands: GitlabChatSlashCommand[] = [
  { name: '/new', description: 'New chat conversation.' },
  { name: '/tests', description: 'Generate tests.' },
  { name: '/help', description: 'Learn what Chat can do.' },
];

function mountMenu(activeIndex = 0) {
  return mount(SlashCommandMenu, { props: { commands, activeIndex } });
}

describe('SlashCommandMenu', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders an option per command with its name and description', () => {
    const wrapper = mountMenu();
    const options = wrapper.findAll('[role="option"]');
    expect(options).toHaveLength(commands.length);
    expect(options[1].text()).toContain('/tests');
    expect(options[1].text()).toContain('Generate tests.');
  });

  it('marks only the active option as selected', () => {
    const wrapper = mountMenu(1);
    const options = wrapper.findAll('[role="option"]');
    expect(options[1].attributes('data-active')).toBe('true');
    expect(options[1].attributes('aria-selected')).toBe('true');
    expect(options[0].attributes('data-active')).toBe('false');
  });

  it('emits select with the index when an option is clicked', async () => {
    const wrapper = mountMenu();
    await wrapper.findAll('[role="option"]')[2].trigger('click');
    expect(wrapper.emitted('select')).toEqual([[2]]);
  });

  it('emits update:activeIndex on hover', async () => {
    const wrapper = mountMenu();
    await wrapper.findAll('[role="option"]')[1].trigger('mouseenter');
    expect(wrapper.emitted('update:activeIndex')).toEqual([[1]]);
  });

  it('scrolls the active option into view when activeIndex changes', async () => {
    const wrapper = mountMenu(0);
    await wrapper.setProps({ activeIndex: 2 });
    await nextTick();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });
});
