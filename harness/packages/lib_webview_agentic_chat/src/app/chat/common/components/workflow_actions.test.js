import { shallowMount } from '@vue/test-utils';
import WorkflowActions from './workflow_actions.vue';

describe('WorkflowActions', () => {
  let wrapper;

  const createWrapper = ({ props = {}, slots = {} } = {}) => {
    wrapper = shallowMount(WorkflowActions, {
      propsData: {
        isApprovingPlan: false,
        isSendingEvent: false,
        ...props,
      },
      slots,
    });
  };

  const findApprovePlan = () => wrapper.find('[data-testid="approve-plan"]');

  beforeEach(() => {
    createWrapper();
  });

  describe('Actions rendering', () => {
    describe('Plan approval', () => {
      describe('when is sending an event', () => {
        beforeEach(() => {
          createWrapper({
            props: {
              isApprovingPlan: true,
              isSendingEvent: true,
            },
          });
        });

        it('does not render the approve plan button', () => {
          expect(findApprovePlan().exists()).toBe(false);
        });
      });

      describe('when not sending an event', () => {
        beforeEach(() => {
          createWrapper({
            props: {
              isApprovingPlan: true,
              isSendingEvent: false,
            },
          });
        });

        it('renders the approve plan button', () => {
          expect(findApprovePlan().exists()).toBe(true);
        });

        it('emits accept-action when approve plan is clicked', async () => {
          await findApprovePlan().vm.$emit('click');

          expect(wrapper.emitted('accept-action')).toHaveLength(1);
        });
      });
    });
  });
});
