import { describe, it, expect, afterEach } from 'vitest';
import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { isDarkBackground, useEditorColorScheme } from './useEditorColorScheme';

describe('isDarkBackground', () => {
  it.each([
    ['#1e1e1e', true],
    ['#181d1d', true],
    ['rgb(24, 23, 29)', true],
    ['#000', true],
  ])('treats dark background %s as dark', (value, expected) => {
    expect(isDarkBackground(value)).toBe(expected);
  });

  it.each([
    ['#ffffff', false],
    ['#fff', false],
    ['#f8f8f8', false],
    ['rgb(255, 255, 255)', false],
    ['rgba(250, 250, 250, 1)', false],
  ])('treats light background %s as light', (value, expected) => {
    expect(isDarkBackground(value)).toBe(expected);
  });

  it.each(['', '   ', 'var(--missing)', 'not-a-color'])(
    'defaults to dark for unparseable value %p',
    (value) => {
      expect(isDarkBackground(value)).toBe(true);
    },
  );

  it('trims surrounding whitespace from the resolved value', () => {
    expect(isDarkBackground('  #ffffff  ')).toBe(false);
  });
});

describe('useEditorColorScheme', () => {
  const EDITOR_BACKGROUND = '--editor-background';
  const wrappers: VueWrapper[] = [];

  const setBackground = (color: string) =>
    document.documentElement.style.setProperty(EDITOR_BACKGROUND, color);

  // The MutationObserver delivers records on a later task, so give it one to run.
  const flushObserver = () =>
    new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

  const mountConsumer = () => {
    let scheme!: ReturnType<typeof useEditorColorScheme>;
    const wrapper = mount(
      defineComponent({
        setup() {
          scheme = useEditorColorScheme();
          return () => null;
        },
      }),
    );
    wrappers.push(wrapper);
    return scheme;
  };

  afterEach(() => {
    while (wrappers.length) {
      wrappers.pop()?.unmount();
    }
    document.documentElement.style.removeProperty(EDITOR_BACKGROUND);
  });

  it('reports light on mount when the editor background is a light color', () => {
    setBackground('#ffffff');
    expect(mountConsumer().isDark.value).toBe(false);
  });

  it('reports dark on mount when the editor background is a dark color', () => {
    setBackground('#1e1e1e');
    expect(mountConsumer().isDark.value).toBe(true);
  });

  it('re-evaluates when the editor background changes after mount', async () => {
    setBackground('#ffffff');
    const { isDark } = mountConsumer();
    expect(isDark.value).toBe(false);

    setBackground('#1e1e1e');
    await flushObserver();

    expect(isDark.value).toBe(true);
  });

  it('shares one reactive ref across every consumer', async () => {
    setBackground('#ffffff');
    const first = mountConsumer();
    const second = mountConsumer();

    expect(first.isDark).toBe(second.isDark);

    setBackground('#1e1e1e');
    await flushObserver();

    expect(first.isDark.value).toBe(true);
    expect(second.isDark.value).toBe(true);
  });

  it('keeps observing while at least one consumer stays mounted', async () => {
    setBackground('#1e1e1e');
    const { isDark } = mountConsumer();
    mountConsumer();

    wrappers.pop()?.unmount();

    setBackground('#ffffff');
    await flushObserver();

    expect(isDark.value).toBe(false);
  });

  it('stops observing once the last consumer unmounts', async () => {
    setBackground('#1e1e1e');
    const { isDark } = mountConsumer();
    expect(isDark.value).toBe(true);

    wrappers.pop()?.unmount();

    setBackground('#ffffff');
    await flushObserver();

    expect(isDark.value).toBe(true);
  });
});
