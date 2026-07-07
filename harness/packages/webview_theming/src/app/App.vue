<script>
import {
  GlAlert,
  GlBadge,
  GlButton,
  GlButtonGroup,
  GlFormInput,
  GlFormTextarea,
  GlIcon,
  GlLink,
  GlModal,
  GlModalDirective,
  GlTable,
  GlToggle,
} from '@gitlab/ui';
import { applyTheme, SupportedThemes } from './utils/theme';

export default {
  name: 'App',
  components: {
    GlAlert,
    GlBadge,
    GlButton,
    GlButtonGroup,
    GlFormInput,
    GlFormTextarea,
    GlIcon,
    GlLink,
    GlModal,
    GlTable,
    GlToggle,
  },
  directives: { GlModalDirective },
  mounted() {
    // FIXME: some race conditions can occur with the theme applied on initial load
    setTimeout(() => {
      applyTheme(this.activeTheme);
    }, 1000);
  },
  data() {
    return {
      activeTheme: SupportedThemes[0].value,
      toggleEnabled: true,
      toggleDisabled: false,
      inputValue: '',
      textareaValue: '',
    };
  },

  watch: {
    activeTheme(newTheme) {
      applyTheme(newTheme);
    },
  },
  themeList: SupportedThemes,
  alertVariants: ['info', 'success', 'warning', 'danger', 'tip'],
  buttonVariants: ['confirm', 'danger', 'dashed', 'link'],
  buttonCategories: ['primary', 'secondary', 'tertiary'],
  badgeVariants: ['info', 'success', 'warning', 'danger', 'default'],
  linkVariants: ['inline', 'meta', 'mention'],
  iconVariants: [
    'default',
    'subtle',
    'strong',
    'disable',
    'link',
    'info',
    'warning',
    'danger',
    'success',
  ],
  iconNames: ['check-circle', 'issue-type-issue', 'chevron-down', 'comment-dots', 'cancel'],
  tableItems: [
    { id: 1, name: 'Component A', status: 'Active' },
    { id: 2, name: 'Component B', status: 'Inactive' },
    { id: 3, name: 'Component C', status: 'Active' },
  ],
  tableFields: [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'status', label: 'Status' },
  ],
};
</script>

<template>
  <div class="container">
    <header class="fixed">
      <h1>GitLab UI Components - Theme Testing</h1>
      <p class="description">
        This page displays various GitLab UI components to help test theming. All components are
        shown with their different states and variants.
      </p>

      <label class="gl-pr-3">Selected Theme</label>
      <gl-button-group>
        <gl-button
          v-for="theme in $options.themeList"
          :key="theme.value"
          @click="activeTheme = theme.value"
          :disabled="activeTheme === theme.value"
          >{{ theme.text }}
        </gl-button>
      </gl-button-group>
    </header>

    <section class="components-container">
      <section class="gl-mt-4">
        <h2>Buttons</h2>

        <div v-for="category in $options.buttonCategories" class="component-group">
          <h3>{{ category }} {{ variant }} Button</h3>
          <div v-for="variant in $options.buttonVariants" class="component-variants">
            <gl-button :category="category" :variant="variant">{{ category }}</gl-button>
            <gl-button :category="primary" :variant="variant" disabled
              >{{ category }}::{{ variant }}::disabled</gl-button
            >
            <gl-button :category="primary" :variant="variant" loading
              >{{ category }}::{{ variant }}::loading</gl-button
            >
          </div>
        </div>
      </section>

      <section>
        <h2>Links</h2>
        <div class="component-group">
          <h3>Link Variants</h3>
          <div class="component-variants">
            <gl-link v-for="variant in $options.linkVariants" :key="variant" :variant="variant">{{
              variant
            }}</gl-link>
          </div>
        </div>
      </section>

      <section>
        <h2>Icons</h2>
        <div class="component-group">
          <h3>Icon Variants</h3>
          <div v-for="variant in $options.iconVariants">
            <div>{{ variant }} icons</div>
            <div class="component-variants">
              <template v-for="name in $options.iconNames" :key="variant + name">
                <gl-icon :name="name" :variant="variant" :size="16" />
              </template>
            </div>
          </div>
        </div>
      </section>

      <section class="component-section">
        <h2>Badges</h2>

        <div class="component-group">
          <h3>Badge Variants</h3>
          <div class="component-variants">
            <gl-badge v-for="variant in $options.badgeVariants" :variant="variant">{{
              variant
            }}</gl-badge>
          </div>
        </div>
      </section>

      <section class="component-section">
        <h2>Alerts</h2>

        <div class="component-group">
          <h3>Alert Variants</h3>
          <div class="component-variants alert-variants">
            <gl-alert v-for="variant in $options.alertVariants" :variant="variant" dismissible
              >This is a {{ variant }} alert</gl-alert
            >
          </div>
        </div>
      </section>

      <section class="component-section">
        <h2>Modal</h2>
        <gl-button v-gl-modal-directive.test-modal-id>Toggle Modal</gl-button>
        <gl-modal
          modalId="test-modal-id"
          v-model="showModal"
          title="Example title"
          :actionPrimary="{ text: 'Okay' }"
          :actionSecondary="{ text: 'Discard Changes' }"
          :actionCancel="{ text: 'Cancel' }"
          :noFocusOnShow="false"
          :scrollable="false"
          size="sm"
        >
          Are you sure you want to stop this workflow? This action cannot be undone.
        </gl-modal>
      </section>

      <section class="component-section">
        <h2>Toggle Switches</h2>

        <div class="component-group">
          <h3>Toggle Variants</h3>
          <div class="component-variants">
            <gl-toggle v-model="toggleEnabled" label="Enabled Toggle" />
            <gl-toggle v-model="toggleDisabled" disabled label="Disabled Toggle" />
          </div>
        </div>
      </section>

      <section class="component-section">
        <h2>Form Inputs</h2>

        <div class="component-group">
          <h3>Text Input</h3>
          <div class="component-variants">
            <gl-form-input v-model="inputValue" placeholder="Default input" />
            <gl-form-input v-model="inputValue" placeholder="Disabled input" disabled />
            <gl-form-input v-model="inputValue" placeholder="Invalid input" state="false" />
            <gl-form-input v-model="inputValue" placeholder="Valid input" state="true" />
          </div>
        </div>

        <div class="component-group">
          <h3>Text Area</h3>
          <div class="component-variants">
            <gl-form-textarea v-model="textareaValue" placeholder="Default textarea" />
            <gl-form-textarea v-model="textareaValue" placeholder="Disabled textarea" disabled />
          </div>
        </div>
      </section>

      <section class="component-section">
        <h2>Tables</h2>

        <div class="component-group">
          <h3>Standard Table</h3>
          <div class="component-variants">
            <gl-table :items="$options.tableItems" :fields="$options.tableFields" />
          </div>
        </div>
      </section>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.fixed {
  position: fixed;
  width: 90%;
  top: 0;
  z-index: 1000;
  background-color: var(--editor-background);
  border-bottom: 2px solid var(--editor-border-color);
  padding: 12px;
}
.container {
  padding: 1rem;
}

.components-container {
  padding-top: 10rem;
}

header {
  margin-bottom: 30px;

  h1 {
    font-size: 24px;
    margin-bottom: 10px;
  }

  .description {
    font-size: 16px;
    color: var(--gl-text-secondary);
  }
}

.component-section {
  margin-bottom: 40px;

  h2 {
    font-size: 20px;
    margin-bottom: 20px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--gl-border-color);
  }
}

.component-group {
  margin-bottom: 30px;

  h3 {
    font-size: 16px;
    margin-bottom: 15px;
  }
}

.component-variants {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin-bottom: 12px;
}
</style>
