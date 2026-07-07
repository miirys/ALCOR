<script>
import { CompositeDisposable } from '@gitlab-org/disposable';
import { messageBus } from './message_bus';
import { renderVulnerabilityDetailsMarkdown } from './render_markdown';

const SEVERITY_COLORS = {
  critical: '#C30000',
  high: '#FF4B4B',
  medium: '#F3B332',
};

export default {
  name: 'VulnerabilityDetails',
  data() {
    return {
      vulnerability: {},
      subscriptions: new CompositeDisposable(),
    };
  },
  computed: {
    location() {
      return `${this.vulnerability.filePath} line ${this.vulnerability.location.start_line}, col ${this.vulnerability.location.start_column}`;
    },
    severityColor() {
      const severity = this.vulnerability.severity?.toLowerCase();
      return SEVERITY_COLORS[severity] || '';
    },
    markdownContent() {
      return renderVulnerabilityDetailsMarkdown(this.vulnerability.description);
    },
  },
  methods: {
    handleLinkClick(event) {
      if (event.target.tagName.toLowerCase() !== 'a') return;
      event.preventDefault();
      messageBus.sendNotification('openLink', {
        href: event.target.href,
      });
    },
  },
  created() {
    this.subscriptions.add(
      messageBus.onNotification('updateDetails', (message) => {
        this.vulnerability = {
          ...message.vulnerability,
          filePath: message.filePath,
          timestamp: message.timestamp,
        };
      }),
    );
  },
  mounted() {
    document.addEventListener('click', this.handleLinkClick);
  },
  beforeUnmount() {
    document.removeEventListener('click', this.handleLinkClick);
    this.subscriptions.dispose();
  },
};
</script>
<template>
  <div class="page gl-ml-3 gl-mr-3">
    <h3 class="title gl-mb-3">{{ vulnerability.name }}</h3>
    <div class="gl-flex">
      <p :style="{ color: severityColor }" class="gl-mb-0 gl-mt-0">{{ vulnerability.severity }}</p>
      <div class="divider gl-ml-5 gl-mr-5"></div>
      <p class="gl-mb-0 gl-mt-0">{{ location }}</p>
      <div class="divider gl-ml-5 gl-mr-5"></div>
      <p class="gl-mb-0 gl-mt-0">{{ vulnerability.timestamp }}</p>
    </div>
    <div v-html="markdownContent"></div>
  </div>
</template>
<style lang="scss">
@import './styles.scss';
</style>
