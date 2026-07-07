import { defineStore } from 'pinia';
import { DEFAULT_DOCKER_IMAGE } from '../constants.ts';

export const DOCKER_STATES = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  IMAGE_PULLED: 'IMAGE_PULLED',
  IMAGE_FAILED: 'IMAGE_FAILED',
  PULLING_IMAGE: 'PULLING_IMAGE',
  NO_IMAGE: 'NO_IMAGE',
};

export const useDockerStore = defineStore('docker', {
  state: () => ({
    // For now, this is the default and cannot be changed
    // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/374
    dockerImage: DEFAULT_DOCKER_IMAGE,
    status: DOCKER_STATES.IMAGE_PULLED,
  }),
  getters: {
    isReady(state) {
      return state.status === DOCKER_STATES.IMAGE_PULLED;
    },
  },
  actions: {
    pullDockerImageCompleted({ success }) {
      this.status = success ? DOCKER_STATES.IMAGE_PULLED : DOCKER_STATES.IMAGE_FAILED;
    },
    pullDockerImage() {
      this.sendNotification('pullDockerImage', this.dockerImage);
      this.status = DOCKER_STATES.PULLING_IMAGE;
    },
    setDockerAvailable(isAvailable) {
      this.status = isAvailable ? DOCKER_STATES.IMAGE_PULLED : DOCKER_STATES.NO_IMAGE;
      if (!isAvailable) {
        this.pullDockerImage();
      }
    },
    verifyDockerImage() {
      this.sendNotification('verifyDockerImage', this.dockerImage);
    },
    setDockerConfigured(configured) {
      this.status = configured ? DOCKER_STATES.NO_IMAGE : DOCKER_STATES.NOT_CONFIGURED;

      if (!configured) {
        setTimeout(() => {
          this.verifyDockerImage();
        }, 5000);
      }
    },
  },
  events: {
    pullDockerImageCompleted: 'pullDockerImageCompleted',
    isDockerImageAvailable: 'setDockerAvailable',
    dockerConfigured: 'setDockerConfigured',
  },
});
