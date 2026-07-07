<script>
import { GlAlert } from '@gitlab/ui';
import { mapActions } from 'pinia';
import { useUsageQuotaStore } from '../../stores/usage_quota.js';

export default {
  name: 'UsageQuotaAlert',
  components: {
    GlAlert,
  },
  props: {
    usageQuotaExceeded: {
      type: Boolean,
      required: true,
    },
    inline: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  methods: {
    ...mapActions(useUsageQuotaStore, ['checkUsageQuota']),
  },
};
</script>

<template>
  <gl-alert
    v-if="usageQuotaExceeded"
    title="No credits remain for this billing period."
    variant="info"
    :dismissible="false"
    class="gl-m-4 usage-quota-alert"
    :class="{ 'gl-bg-transparent': inline }"
    primary-button-text="Refresh"
    @primaryAction="checkUsageQuota"
  >
    Contact your administrator for more credits, or switch to Non-Agentic Chat to continue.
    <p class="gl-mb-0 gl-mt-4">When you have more credits, refresh.</p>
  </gl-alert>
</template>
