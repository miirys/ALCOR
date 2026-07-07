<script>
import { mapActions } from 'pinia';
import { GlIcon, GlButton, GlSprintf } from '@gitlab/ui';
import { useMainStore } from '../stores/main';

export default {
  components: {
    GlIcon,
    GlButton,
    GlSprintf,
  },
  props: {
    item: {
      type: Object,
      required: true,
      validator: (item) => 'name' in item && 'value' in item,
    },
  },
  computed: {
    message() {
      switch (this.item.name) {
        case 'feature_flag':
          return {
            text: '%{linkStart}Turn on the feature flag duo_workflow%{linkEnd} for this project.',
            link: 'https://docs.gitlab.com/administration/feature_flags/',
          };
        case 'duo_features_enabled':
          return {
            text: '%{linkStart}Turn on GitLab Duo%{linkEnd} for this project.',
            link: 'https://docs.gitlab.com/ee/user/gitlab_duo/turn_on_off/',
          };
        case 'feature_available':
          return {
            text: '%{linkStart}Turn on experimental features%{linkEnd}',
            link: 'https://docs.gitlab.com/ee/user/gitlab_duo/turn_on_off.html#turn-on-beta-and-experimental-features',
          };
        default:
          return {
            text: this.item.message,
            link: '',
          };
      }
    },
  },
  methods: {
    ...mapActions(useMainStore, ['openUrl']),
    computeStatusIcon() {
      return this.item.value ? 'status-success' : 'status-failed';
    },
    computeStatusVariant() {
      return this.item.value ? 'success' : 'danger';
    },
  },
};
</script>
<template>
  <li class="gl-list-none">
    <gl-icon :name="computeStatusIcon()" :variant="computeStatusVariant()" />
    <span class="gl-pl-3">
      <gl-sprintf :message="message.text">
        <template #link="{ content }">
          <gl-button v-if="message.link" variant="link" @click="openUrl(message.link)">
            {{ content }}
          </gl-button>
          <span v-else>{{ content }}</span>
        </template>
      </gl-sprintf>
    </span>
  </li>
</template>
