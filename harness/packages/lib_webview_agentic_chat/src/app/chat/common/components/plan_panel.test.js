import { shallowMount } from '@vue/test-utils';
import { GlCollapse } from '@gitlab/ui';
import { DuoWorkflowStatus } from '@gitlab-lsp/workflow-api';
import PlanPanel from './plan_panel.vue';

describe('PlanPanel', () => {
  let wrapper;
  const mockPlanSteps = [
    { id: '1', description: 'Step 1', status: 'Completed' },
    { id: '2', description: 'Step 2', status: 'Running' },
    { id: '3', description: 'Step 3', status: 'Pending' },
  ];

  const mockCompletedSteps = [
    { id: '1', description: 'Step 1', status: 'Completed' },
    { id: '2', description: 'Step 2', status: 'Completed' },
    { id: '3', description: 'Step 3', status: 'Completed' },
  ];

  const mockMixedSteps = [
    { id: '1', description: 'Step 1', status: 'Completed' },
    { id: '2', description: 'Step 2', status: 'Failed' },
    { id: '3', description: 'Step 3', status: 'Completed' },
  ];

  const mockPlanStepsFirstStep = [
    { id: '1', description: 'Step 1', status: 'Running' },
    { id: '2', description: 'Step 2', status: 'Pending' },
    { id: '3', description: 'Step 3', status: 'Pending' },
  ];

  const mockPlanStepsPending = [
    { id: '1', description: 'Step 1', status: 'Pending' },
    { id: '2', description: 'Step 2', status: 'Pending' },
    { id: '3', description: 'Step 3', status: 'Pending' },
  ];

  const createComponent = (props = {}) => {
    return shallowMount(PlanPanel, {
      propsData: {
        workflowStatus: DuoWorkflowStatus.RUNNING,
        planSteps: mockPlanStepsPending,
        isPlanApproved: false,
        ...props,
      },
    });
  };

  const findShowPlanButton = () => wrapper.find('[data-testid="toggle-panel"]');
  const findActiveStep = () => wrapper.find('[data-testid="active-step"]');
  const findAllSteps = () => wrapper.findAll('li');
  const findStepCount = () => wrapper.find('[data-testid="step-count"]');
  const findCollapse = () => wrapper.findComponent(GlCollapse);

  describe('when there are no steps', () => {
    beforeEach(() => {
      wrapper = createComponent({ planSteps: [] });
    });

    it('does not render', () => {
      expect(findCollapse().exists()).toBe(false);

      expect(findShowPlanButton().exists()).toBe(false);
    });
  });

  describe('with plan steps', () => {
    beforeEach(() => {
      wrapper = createComponent();
    });

    it('renders correctly', () => {
      expect(findCollapse().exists()).toBe(true);

      expect(findShowPlanButton().exists()).toBe(true);
    });
  });

  describe('when panel is clicked', () => {
    it('toggles panel visibility', async () => {
      expect(findCollapse().attributes().visible).toBeUndefined();

      await findShowPlanButton().trigger('click');
      expect(findCollapse().attributes().visible).toBe('true');

      await findShowPlanButton().trigger('click');
      expect(findCollapse().attributes().visible).toBeUndefined();
    });
  });

  describe('active step', () => {
    describe('when the current step is at index 0', () => {
      describe('and the plan is approved', () => {
        beforeEach(() => {
          wrapper = createComponent({
            isPlanApproved: true,
          });
        });

        it('shows the currentStep as active', () => {
          expect(findActiveStep().exists()).toBe(true);
          expect(findAllSteps().at(0).classes()).toContain('selected-item');
          expect(findStepCount().text()).toContain('At step 1 / 3');
        });
      });

      describe('and the plan is not approved', () => {
        beforeEach(() => {
          wrapper = createComponent({
            isPlanApproved: false,
          });
        });

        it('does not show the active step', () => {
          expect(findActiveStep().exists()).toBe(false);
          expect(findStepCount().exists()).toBe(false);
        });
      });
    });

    describe('when workflow is not running', () => {
      beforeEach(() => {
        wrapper = createComponent({
          workflowStatus: DuoWorkflowStatus.FINISHED,
        });
      });

      it('does not show the active step', () => {
        expect(findActiveStep().exists()).toBe(false);
        expect(findStepCount().exists()).toBe(false);
      });
    });
  });

  describe('when the plan is approved', () => {
    describe('at index 0', () => {
      beforeEach(() => {
        wrapper = createComponent({
          isPlanApproved: true,
          planSteps: mockPlanStepsFirstStep,
          workflowStatus: DuoWorkflowStatus.RUNNING,
        });
      });

      it('shows the currentStep as active', () => {
        expect(findActiveStep().exists()).toBe(true);
        expect(findAllSteps().at(0).classes()).toContain('selected-item');
        expect(findStepCount().text()).toContain('At step 1 / 3');
      });
    });

    describe('when all steps are completed', () => {
      beforeEach(() => {
        wrapper = createComponent({
          isPlanApproved: true,
          planSteps: mockCompletedSteps,
          workflowStatus: DuoWorkflowStatus.RUNNING,
        });
      });

      it('shows the currentStep as active', () => {
        expect(findActiveStep().exists()).toBe(true);
        expect(findAllSteps().at(2).classes()).not.toContain('selected-item');
        expect(findStepCount().text()).toContain('At step 3 / 3');
      });
    });

    describe('when some are completed and some failed', () => {
      beforeEach(() => {
        wrapper = createComponent({
          isPlanApproved: true,
          planSteps: mockMixedSteps,
          workflowStatus: DuoWorkflowStatus.RUNNING,
        });
      });

      it('shows the currentStep as active', () => {
        expect(findActiveStep().exists()).toBe(true);
        expect(findAllSteps().at(2).classes()).not.toContain('selected-item');
        expect(findStepCount().text()).toContain('At step 3 / 3');
      });
    });
  });

  describe('when the plan is not approved', () => {
    describe('but the active step is above 0', () => {
      beforeEach(() => {
        wrapper = createComponent({
          planSteps: mockPlanSteps,
          isPlanApproved: false,
          workflowStatus: DuoWorkflowStatus.RUNNING,
        });
      });

      it('shows the currentStep as active', () => {
        expect(findActiveStep().exists()).toBe(true);
        expect(findAllSteps().at(1).classes()).toContain('selected-item');
        expect(findStepCount().text()).toContain('At step 2 / 3');
      });
    });
  });

  describe('dynamic panel opening and closing', () => {
    describe('when isApprovingPlan becomes true', () => {
      beforeEach(() => {
        wrapper = createComponent({
          isApprovingPlan: false,
        });
      });

      it('automatically opens the panel', async () => {
        await wrapper.setProps({ isApprovingPlan: true });

        expect(findCollapse().attributes().visible).toBe('true');
      });
    });

    describe('when the user approves plan', () => {
      beforeEach(() => {
        wrapper = createComponent({
          isPlanApproved: false,
          workflowStatus: DuoWorkflowStatus.PLAN_APPROVAL,
        });
      });

      describe('and the status changes to not PLAN_APPROVAL', () => {
        it('does not automatically open the panel', async () => {
          await wrapper.setProps({ isPlanApproved: true });
          expect(findCollapse().attributes().visible).toBeUndefined();

          await wrapper.setProps({ workflowStatus: DuoWorkflowStatus.RUNNING });
          expect(findCollapse().attributes().visible).toBeUndefined();
        });
      });

      describe('and the plan approval changes back to false', () => {
        it('does not open the panel', async () => {
          await wrapper.setProps({ isPlanApproved: true });
          expect(findCollapse().attributes().visible).toBeUndefined();

          await wrapper.setProps({ isPlanApproved: false });
          expect(findCollapse().attributes().visible).toBeUndefined();
        });
      });
    });

    describe('when the panel is opened', () => {
      describe('and isPlanApproved becomes true', () => {
        beforeEach(async () => {
          wrapper = createComponent({
            isPlanApproved: false,
          });

          await findShowPlanButton().trigger('click');
        });

        it('automatically closes the panel', async () => {
          await wrapper.setProps({ isPlanApproved: true });

          expect(findCollapse().attributes().visible).toBeUndefined();
        });
      });
    });
  });

  describe('when workflow is terminated', () => {
    beforeEach(() => {
      wrapper = createComponent({ workflowStatus: DuoWorkflowStatus.FINISHED });
    });
    it('does not show active step', () => {
      expect(findActiveStep().exists()).toBe(false);
      expect(findStepCount().exists()).toBe(false);
    });
  });
});
