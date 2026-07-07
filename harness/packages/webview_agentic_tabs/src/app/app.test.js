import VueRouter from 'vue-router';
import { createLocalVue, shallowMount } from '@vue/test-utils';
import App from './app.vue';
import TabContent from './components/tab.vue';
import { CHAT_ROUTE, FLOW_ROUTE } from './router';

jest.mock('@gitlab-org/lib-agentic-duo-chat', () => ({
  WEBVIEW_ID: 'agentic-duo-chat',
}));

const localVue = createLocalVue();
localVue.use(VueRouter);

describe('App', () => {
  let wrapper;
  let router;

  const TAB_DATA = [
    {
      id: CHAT_ROUTE,
      title: 'Chat',
      path: '/chat',
    },
    {
      id: FLOW_ROUTE,
      title: 'Flows',
      path: '/flow',
    },
  ];

  const createWrapper = async (routeName = CHAT_ROUTE, params = {}) => {
    router = new VueRouter({
      mode: 'abstract',
      routes: TAB_DATA.map((tab) => ({
        path: tab.path,
        name: tab.id,
        component: { template: `<div>${tab.title}</div>` },
      })),
    });

    // Push the initial route and wait for it to complete
    await router.push({ name: routeName, params });

    wrapper = shallowMount(App, {
      localVue,
      router,
      stubs: {
        TabContent: true,
      },
    });

    await wrapper.vm.$nextTick();

    return wrapper;
  };

  afterEach(() => {
    if (wrapper) {
      wrapper.destroy();
    }
    jest.clearAllMocks();
  });

  describe('tab rendering and visibility', () => {
    beforeEach(async () => {
      wrapper = await createWrapper();
    });

    it('renders all tabs with proper titles and active state', () => {
      const tabElements = wrapper.findAll('.tab');

      expect(tabElements).toHaveLength(2);
      expect(tabElements.at(0).text()).toBe('Chat');
      expect(tabElements.at(1).text()).toBe('Flows');
      expect(tabElements.at(0).classes()).toContain('active');
    });
  });

  describe('tab content rendering', () => {
    beforeEach(async () => {
      wrapper = await createWrapper();
    });

    it('renders TabContent components with correct props and mode parameters', () => {
      const tabContent = wrapper.findComponent(TabContent);

      expect(tabContent.props()).toMatchObject({
        src: '/webview/agentic-duo-chat?mode=chat-mode',
        title: 'Chat',
      });
    });
  });

  describe('tab navigation', () => {
    let routerPushSpy;

    beforeEach(async () => {
      wrapper = await createWrapper();
      routerPushSpy = jest.spyOn(router, 'push');
    });

    afterEach(() => {
      routerPushSpy.mockRestore();
    });

    it('switches tabs when clicking inactive tab', async () => {
      routerPushSpy.mockClear();

      const workflowTab = wrapper.findAll('.tab').at(1);
      await workflowTab.trigger('click');

      expect(routerPushSpy).toHaveBeenCalledWith({ name: FLOW_ROUTE });
    });

    it('does not navigate when clicking active tab', async () => {
      routerPushSpy.mockClear();

      const activeTab = wrapper.findAll('.tab').at(0);
      await activeTab.trigger('click');

      expect(routerPushSpy).not.toHaveBeenCalled();
    });
  });

  describe('tab content URLs', () => {
    beforeEach(async () => {
      wrapper = await createWrapper();
    });

    it('routes chat tab to chat webview with chat-mode', () => {
      const tabContentElements = wrapper.findAllComponents(TabContent);
      expect(tabContentElements.at(0).props().src).toBe('/webview/agentic-duo-chat?mode=chat-mode');
    });

    it('routes flow tab to chat webview with flow-mode', () => {
      const tabContentElements = wrapper.findAllComponents(TabContent);
      expect(tabContentElements.at(1).props().src).toBe('/webview/agentic-duo-chat?mode=flow-mode');
    });
  });
});
