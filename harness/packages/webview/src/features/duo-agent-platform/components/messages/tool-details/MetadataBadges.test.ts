import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MetadataBadges from './MetadataBadges.vue';

function mountBadges(args: Record<string, unknown>) {
  return mount(MetadataBadges, { props: { args } });
}

describe('MetadataBadges', () => {
  describe('when args is empty', () => {
    it('renders nothing', () => {
      const wrapper = mountBadges({});
      expect(wrapper.find('div').exists()).toBe(false);
    });
  });

  describe('when args contains a project field', () => {
    it('renders a Project badge for project_path', () => {
      const wrapper = mountBadges({ project_path: 'gitlab-org/gitlab' });
      expect(wrapper.text()).toContain('Project: gitlab-org/gitlab');
    });

    it('prefers project_name over project_path', () => {
      const wrapper = mountBadges({
        project_name: 'GitLab',
        project_path: 'gitlab-org/gitlab',
      });
      const text = wrapper.text();
      expect(text).toContain('Project: GitLab');
      expect(text).not.toContain('gitlab-org/gitlab');
    });

    it('renders only one Project badge even when multiple project keys are present', () => {
      const wrapper = mountBadges({
        project_name: 'GitLab',
        project_path: 'gitlab-org/gitlab',
        project_full_path: 'gitlab-org/gitlab',
      });
      const badges = wrapper.findAll('span');
      const projectBadges = badges.filter((b) => b.text().startsWith('Project'));
      expect(projectBadges).toHaveLength(1);
    });
  });

  describe('when args contains branch fields', () => {
    it('renders both source_branch and target_branch badges', () => {
      const wrapper = mountBadges({
        source_branch: 'feature/my-branch',
        target_branch: 'main',
      });
      const text = wrapper.text();
      expect(text).toContain('Source branch: feature/my-branch');
      expect(text).toContain('Target branch: main');
    });

    it('uses badge.key as the :key so both branch badges render', () => {
      const wrapper = mountBadges({
        source_branch: 'feat',
        target_branch: 'main',
      });
      expect(wrapper.findAll('span')).toHaveLength(2);
    });
  });

  describe('when args contains issue and merge request fields', () => {
    it('renders Issue and Merge request badges', () => {
      const wrapper = mountBadges({ issue_iid: '42', merge_request_iid: '7' });
      const text = wrapper.text();
      expect(text).toContain('Issue: 42');
      expect(text).toContain('Merge request: 7');
    });
  });

  describe('when args contains unknown fields only', () => {
    it('renders nothing for unrecognised keys', () => {
      const wrapper = mountBadges({ unknown_field: 'value', another: 'thing' });
      expect(wrapper.find('div').exists()).toBe(false);
    });
  });
});
