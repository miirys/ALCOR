<script>
import { GlLink, GlIcon, GlSprintf } from '@gitlab/ui';
import { mapActions } from 'pinia';
import { useMainStore } from '../stores/main';
import { DOCKER_STATES } from '../stores/docker';

export default {
  components: {
    GlLink,
    GlIcon,
    GlSprintf,
  },
  props: {
    dockerStatus: {
      required: true,
      type: String,
    },
  },
  computed: {
    dockerImageInfo() {
      if (this.dockerStatus === DOCKER_STATES.IMAGE_PULLED) {
        return {
          icon: 'status-success',
          variant: 'success',
          message: '%{linkStart}Pull the base Docker image%{linkEnd}.',
        };
      } else if (this.dockerStatus === DOCKER_STATES.PULLING_IMAGE) {
        return {
          icon: 'status-running',
          variant: 'info',
          message: 'Pulling the base docker image...',
        };
      } else if (this.dockerStatus === DOCKER_STATES.IMAGE_FAILED) {
        return {
          icon: 'status-failed',
          variant: 'danger',
          message: '%{linkStart}Pull the base Docker image%{linkEnd}.',
        };
      }

      return {
        icon: 'status-waiting',
        variant: 'subtle',
        message: '%{linkStart}Pull the base Docker image%{linkEnd}.',
      };
    },
    dockerConfiguredInfo() {
      return this.dockerStatus === DOCKER_STATES.NOT_CONFIGURED
        ? { icon: 'status-waiting', variant: 'subtle' }
        : { icon: 'status-success', variant: 'success' };
    },
    dockerHealthChecks() {
      return [
        {
          message:
            "Install a Docker container engine, such as %{linkStart}Rancher Desktop%{linkEnd}, if you haven't already.",
          link: 'https://docs.rancherdesktop.io/getting-started/installation/',
          icon: 'status-neutral',
          variant: 'subtle',
        },
        {
          ...this.dockerConfiguredInfo,
          message:
            '%{linkStart}Set the Docker socket path in VS Code%{linkEnd} and start the container engine.',
          link: 'https://docs.gitlab.com/user/duo_workflow/set_up/#install-docker-and-set-the-socket-file-path',
        },
        {
          ...this.dockerImageInfo,
          link: 'https://docs.gitlab.com/user/duo_workflow/set_up/#install-docker-and-set-the-socket-file-path',
        },
      ];
    },
  },
  methods: {
    ...mapActions(useMainStore, ['openUrl']),
  },
};
</script>
<template>
  <div class="gl-border-t gl-py-6">
    <ul class="gl-p-0 gl-text-left">
      <li v-for="check in dockerHealthChecks" :key="check.message" class="gl-list-none gl-py-3">
        <div class="gl-flex gl-items-flex-start gl-gap-3 gl-flex-nowrap">
          <span><gl-icon :name="check.icon" :variant="check.variant" /></span>
          <span
            ><gl-sprintf :message="check.message">
              <template #link="{ content }">
                <gl-link @click.prevent="openUrl(check.link)">{{ content }}</gl-link>
              </template>
            </gl-sprintf></span
          >
        </div>
      </li>
    </ul>
  </div>
</template>
