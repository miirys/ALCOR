import { mount } from '@vue/test-utils';
import Tab from './tab.vue';

describe('Tab', () => {
  let wrapper;

  const defaultProps = {
    id: 'tab',
    src: 'https://example.com',
    title: 'Test Tab',
  };

  const createWrapper = (props = {}) => {
    return mount(Tab, {
      propsData: {
        ...defaultProps,
        ...props,
      },
    });
  };

  afterEach(() => {
    if (wrapper) {
      wrapper.destroy();
    }
  });

  describe('component rendering', () => {
    it('renders correctly with required props', () => {
      wrapper = createWrapper();

      expect(wrapper.exists()).toBe(true);
      expect(wrapper.find('iframe').exists()).toBe(true);
    });

    it('renders custom title when provided', () => {
      const customTitle = 'Custom Tab Title';
      wrapper = createWrapper({ title: customTitle });

      const iframe = wrapper.find('iframe');
      expect(iframe.attributes('title')).toBe(customTitle);
    });

    it('sets the correct src attribute on iframe', () => {
      const customSrc = 'https://custom-url.com';
      wrapper = createWrapper({ src: customSrc });

      const iframe = wrapper.find('iframe');
      expect(iframe.attributes('src')).toBe(customSrc);
    });

    it('sets the correct id attribute on iframe', () => {
      const id = 'test-id';
      wrapper = createWrapper({ id });

      const iframe = wrapper.find('iframe');
      expect(iframe.attributes('id')).toBe(`iframe-${id}`);
    });
  });

  describe('event handlers', () => {
    let consoleLogSpy;
    let consoleErrorSpy;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('event handlers are bound correctly using stubs', async () => {
      const onLoadStub = jest.fn();
      const onErrorStub = jest.fn();

      // Mount with stubbed methods
      wrapper = mount(Tab, {
        propsData: defaultProps,
        methods: {
          onLoad: onLoadStub,
          onError: onErrorStub,
        },
      });

      const iframe = wrapper.find('iframe');

      await iframe.trigger('load');
      expect(onLoadStub).toHaveBeenCalled();

      await iframe.trigger('error');
      expect(onErrorStub).toHaveBeenCalled();
    });
  });
});
