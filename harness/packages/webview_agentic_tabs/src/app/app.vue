<script>
import { WEBVIEW_ID as CHAT_WEBVIEW_ID } from '@gitlab-org/lib-agentic-duo-chat/contract';
import TabContent from './components/tab.vue';
import { CHAT_ROUTE, FLOW_ROUTE } from './router';

export default {
  name: 'TabsWrapper',
  components: {
    TabContent,
  },
  data() {
    return {
      tabs: [
        {
          id: CHAT_ROUTE,
          title: 'Chat',
        },
        {
          id: FLOW_ROUTE,
          title: 'Flows',
        },
      ],
    };
  },
  methods: {
    switchTab(tabId) {
      if (this.$route.name !== tabId) {
        this.$router.push({ name: tabId });
      }
    },
    isTabVisible(tab) {
      return this.$route.name === tab.id;
    },
    getTabMode(tabId) {
      return tabId === CHAT_ROUTE ? 'chat-mode' : 'flow-mode';
    },
    getTabSrcWithCsrf(tabId) {
      const urlParams = new URLSearchParams(window.location.search);
      const csrf = urlParams.get('_csrf');

      const baseWebviewPath = `/webview/${CHAT_WEBVIEW_ID}?mode=${this.getTabMode(tabId)}`;

      return csrf ? `${baseWebviewPath}&_csrf=${csrf}` : baseWebviewPath;
    },
  },
};
</script>

<template>
  <div class="app">
    <div class="tabs gl-flex gl-px-3 gl-pt-3 gl-pb-0 gl-fixed gl-top-2">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab', { active: $route.name === tab.id }]"
        @click="switchTab(tab.id)"
      >
        {{ tab.title }}
      </div>
    </div>

    <div class="content gl-flex-grow gl-flex gl-flex-column gl-pt-2">
      <tab-content
        v-for="tab in tabs"
        :key="tab.id"
        v-show="isTabVisible(tab)"
        :src="getTabSrcWithCsrf(tab.id)"
        :title="tab.title"
        :id="tab.id"
        class="iframe-panel"
      />
    </div>
  </div>
</template>

<style lang="scss">
@import './styles.scss';

.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--glDuoChat-background-alternative);
  font-family: var(--font-family);
}

.tabs {
  background: var(--glDuoChat-background);
}

.tab {
  padding: 0 12px 8px;
  background: transparent;
  color: var(--glDuoChat-foreground-muted);
  cursor: pointer;
  font-size: 11px;
  text-transform: uppercase;
  position: relative;
  transition: color 0.2s ease;
  border: none;
}

.tab:hover {
  color: var(--glDuoChat-foreground);
}

.tab.active {
  color: var(--glDuoChat-foreground);
  background: transparent;
}

.tab.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--glDuoChat-foreground);
}

.content {
  overflow: hidden;
  background: var(--glDuoChat-background-alternative);
}
</style>
