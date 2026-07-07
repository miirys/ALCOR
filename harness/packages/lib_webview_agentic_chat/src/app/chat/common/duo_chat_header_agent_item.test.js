import { shallowMount } from '@vue/test-utils';
import { GlIcon } from '@gitlab/ui';
import ChatAgentItem, { i18n } from './duo_chat_header_agent_item.vue';

export const getKey = (name) => `$_gl_jest_${name}`;

export const getBinding = (el, name) => el[getKey(name)];

const writeBindingToElement = (el, name, { value, arg, modifiers }) => {
  el[getKey(name)] = {
    value,
    arg,
    modifiers,
  };
};

export const createMockDirective = (name) => {
  return {
    bind(el, binding) {
      writeBindingToElement(el, name, binding);
    },

    update(el, binding) {
      writeBindingToElement(el, name, binding);
    },

    unbind(el) {
      delete el[getKey(name)];
    },
  };
};

describe('ChatAgentItem', () => {
  let wrapper;

  const createWrapper = (foundational = false) => {
    return shallowMount(ChatAgentItem, {
      propsData: {
        agent: {
          name: 'Test Agent',
          description: 'Test description',
          foundational,
        },
      },
      directives: {
        GlTooltip: createMockDirective('gl-tooltip'),
      },
    });
  };

  const findIcon = () => wrapper.findComponent(GlIcon);

  describe('when foundational agent', () => {
    beforeEach(() => {
      wrapper = createWrapper(true);
    });

    it('renders agent with icon', () => {
      expect(wrapper.text()).toContain('Test Agent');
      expect(wrapper.text()).toContain('Test description');
      expect(findIcon().props()).toMatchObject({
        name: 'tanuki-verified',
        variant: 'subtle',
      });
      expect(findIcon().attributes('title')).toBe(i18n.CHAT_VERIFIED_AGENT);

      const tooltip = getBinding(findIcon().element, 'gl-tooltip');
      expect(tooltip).toBeDefined();
    });
  });

  describe('when catalog agent', () => {
    beforeEach(() => {
      wrapper = createWrapper(false);
    });

    it('renders agent without icon', () => {
      expect(wrapper.text()).toContain('Test Agent');
      expect(wrapper.text()).toContain('Test description');
      expect(findIcon().exists()).toBe(false);
    });
  });
});
