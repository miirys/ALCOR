import { shallowMount } from '@vue/test-utils';
import { GlIcon, GlSprintf } from '@gitlab/ui';
import { DOCKER_STATES } from '../stores/docker';

import DockerHealthChecks from './docker_health_checks.vue';

describe('DockerHealthCheck', () => {
  let wrapper;

  const createWrapper = (propsData = {}) => {
    wrapper = shallowMount(DockerHealthChecks, {
      propsData: {
        status: DOCKER_STATES.NOT_CONFIGURED,
        ...propsData,
      },
      stubs: {
        GlSprintf,
      },
    });
  };

  describe('set docker path message', () => {
    it.each`
      dockerStatus                    | icon                | variant
      ${DOCKER_STATES.NO_IMAGE}       | ${'status-success'} | ${'success'}
      ${DOCKER_STATES.NOT_CONFIGURED} | ${'status-waiting'} | ${'subtle'}
    `(
      'shows $icon with $variant when docker status is $dockerStatus',
      ({ dockerStatus, icon, variant }) => {
        createWrapper({ dockerStatus });
        const [, message] = wrapper.findAll('li').wrappers;
        const iconComponent = message.findComponent(GlIcon);
        expect(iconComponent.props()).toMatchObject({ name: icon, variant });
      },
    );
  });

  describe('pull docker image message', () => {
    it.each`
      dockerStatus                   | text
      ${DOCKER_STATES.PULLING_IMAGE} | ${'Pulling the base docker image...'}
      ${DOCKER_STATES.NO_IMAGE}      | ${'Pull the base Docker image'}
    `('shows "$text" when docker status is $dockerStatus', ({ dockerStatus, text }) => {
      createWrapper({ dockerStatus });
      const [, , message] = wrapper.findAll('li').wrappers;

      expect(message.text()).toContain(text);
    });

    it.each`
      dockerStatus                    | icon                | variant
      ${DOCKER_STATES.IMAGE_PULLED}   | ${'status-success'} | ${'success'}
      ${DOCKER_STATES.IMAGE_FAILED}   | ${'status-failed'}  | ${'danger'}
      ${DOCKER_STATES.PULLING_IMAGE}  | ${'status-running'} | ${'info'}
      ${DOCKER_STATES.NOT_CONFIGURED} | ${'status-waiting'} | ${'subtle'}
    `(
      'shows a $variant $icon when docker state is: $dockerStatus',
      ({ dockerStatus, icon, variant }) => {
        createWrapper({ dockerStatus });
        const [, , message] = wrapper.findAll('li').wrappers;
        const iconComponent = message.findComponent(GlIcon);

        expect(iconComponent.props()).toMatchObject({ name: icon, variant });
      },
    );

    it('shows waiting icons if docker is unavailable', () => {
      createWrapper({ dockerStatus: DOCKER_STATES.NOT_CONFIGURED });
      const [, , message] = wrapper.findAll('li').wrappers;
      const iconComponent = message.findComponent(GlIcon);

      expect(iconComponent.props()).toMatchObject({ name: 'status-waiting', variant: 'subtle' });
    });
  });
});
