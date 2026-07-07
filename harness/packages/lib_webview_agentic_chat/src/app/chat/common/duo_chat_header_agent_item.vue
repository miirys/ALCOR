<script>
import { GlTooltipDirective, GlIcon } from '@gitlab/ui';
import { translate } from '@gitlab/ui/dist/utils/i18n';

export const i18n = {
  CHAT_VERIFIED_AGENT: translate('DuoChat.verifiedAgent', 'Created and maintained by GitLab'),
};

export default {
  name: 'ChatAgentItem',
  components: {
    GlIcon,
  },
  directives: {
    GlTooltip: GlTooltipDirective,
  },
  props: {
    agent: {
      type: Object,
      required: true,
    },
  },
  i18n,
};
</script>

<template>
  <span class="gl-flex gl-flex-col">
    <span class="gl-mb-1 gl-inline-block gl-font-semibold">
      {{ agent.name }}
      <gl-icon
        v-if="agent.foundational"
        v-gl-tooltip
        name="tanuki-verified"
        variant="subtle"
        :title="$options.i18n.CHAT_VERIFIED_AGENT"
      />
    </span>
    <span
      :title="agent.description"
      class="gl-overflow-hidden gl-text-subtle gl-text-sm gl-truncate-text"
      style="--mobile-lines: 2; --lines: 2"
    >
      {{ agent.description }}
    </span>
  </span>
</template>
