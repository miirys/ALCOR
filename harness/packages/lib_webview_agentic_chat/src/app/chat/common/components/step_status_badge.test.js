import { shallowMount } from '@vue/test-utils';
import { GlIcon } from '@gitlab/ui';
import StepStatusBadge from './step_status_badge.vue';

describe('StepStatusBadge', () => {
  let wrapper;

  const createWrapper = (status, isActiveStep = false) => {
    wrapper = shallowMount(StepStatusBadge, {
      propsData: {
        status,
        isActiveStep,
      },
    });
  };

  const findIcon = () => wrapper.findComponent(GlIcon);

  describe('when isActiveStep is true', () => {
    beforeEach(() => {
      createWrapper('Completed', true);
    });

    it('renders the in progress icon', () => {
      expect(findIcon().props()).toEqual(
        expect.objectContaining({
          name: 'status-running',
          variant: 'info',
          size: 12,
        }),
      );
    });
  });

  it.each`
    status           | variant      | icon
    ${'Not Started'} | ${'subtle'}  | ${'status-waiting'}
    ${'In Progress'} | ${'info'}    | ${'status-running'}
    ${'Completed'}   | ${'success'} | ${'status-success'}
    ${'Cancelled'}   | ${'danger'}  | ${'status-cancelled'}
    ${'Unknown'}     | ${'subtle'}  | ${'status-waiting'}
  `('renders the correct icon and variant for status: $status', ({ status, variant, icon }) => {
    createWrapper(status);
    expect(findIcon().props()).toEqual(
      expect.objectContaining({
        name: icon,
        variant,
        size: 12,
      }),
    );
  });
});
