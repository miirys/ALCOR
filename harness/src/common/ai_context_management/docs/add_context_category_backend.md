# Add a new AI Context Category to the Backend

This guide will walk you through the process of adding a new AI context category and Unit Primitive to the backend.

[[_TOC_]]

## Add a new category

1. [Add a new unit primitive](#add-a-new-unit-primitive)
    1. [Add a unit primitive to `gitlab-cloud-connector`](#add-a-unit-primitive-to-gitlab-cloud-connector)
1. [Add additional context category to the AI Gateway project](#add-additional-context-category-to-the-ai-gateway-project)
1. [Add a new category type to Rails backend](#add-a-new-category-type-to-rails-backend)

### Add a new unit primitive

Before creating a new additional context category, you need to add a new Unit Primitive.

A unit primitive name must follow the `include_<category_name>_context` format.

For example:

- For the `file` category, the Unit Primitive name would be `include_file_context`.
- For the `issue` category, it would be `include_issue_context`.

To create a new Unit Primitive, add that Unit Primitive to the [Cloud Connector](https://gitlab.com/gitlab-org/cloud-connector/gitlab-cloud-connector) repository.

#### Add a unit primitive to `gitlab-cloud-connector`

To add a new Unit Primitive to `gitlab-cloud-connector`, follow the [CloudConnector guide](https://docs.gitlab.com/development/cloud_connector/#register-new-feature-for-gitlab-self-managed-dedicated-and-gitlabcom-customers).

Here is an example of `include_file_context` and `include_issue_context` Unit Primitives:

1. Define a new constant in [`GitLabUnitPrimitive` class](https://gitlab.com/gitlab-org/cloud-connector/gitlab-cloud-connector/-/blob/7be882a456bb95205e5144c29eccc47df1d35740/src/python/gitlab_cloud_connector/gitlab_features.py#L41-42). Similar to `include_file_context` and `include_issue_context`.

1. Add a Unit Primitive configuration file to [`config/unit_primitives`](https://gitlab.com/gitlab-org/cloud-connector/gitlab-cloud-connector/-/tree/main/config/unit_primitives?ref_type=heads). Examples:

   - [`include_file_context`](https://gitlab.com/gitlab-org/cloud-connector/gitlab-cloud-connector/-/blob/main/config/unit_primitives/include_file_context.yml)
   - [`include_issue_context`](https://gitlab.com/gitlab-org/cloud-connector/gitlab-cloud-connector/-/blob/main/config/unit_primitives/include_issue_context.yml)

   **NOTE**:
   Ensure the `cut_off_date` in the configuration file matches the [`duo_chat`](https://gitlab.com/gitlab-org/cloud-connector/gitlab-cloud-connector/-/blob/main/config/unit_primitives/duo_chat.yml) cut-off date.

### Add additional context category to the AI Gateway project

Add a new category name to the list in the [`AdditionalContext` class](https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist/-/blob/424e30131b821931ad90df48040f0c1d75962555/ai_gateway/chat/agents/typing.py#L78-81).

### Add a new category type to Rails backend

Add a new category to [`Ai::AdditionalContext::DUO_CHAT_CONTEXT_CATEGORIES`](https://gitlab.com/gitlab-org/gitlab/-/blob/13736b573e0c67cf766a0ea2c1269d6eb78f842b/ee/lib/ai/additional_context.rb#L16-23).

```ruby
DUO_CHAT_CONTEXT_CATEGORIES = {
  file: 'file',
  snippet: 'snippet',
  merge_request: 'merge_request',
  issue: 'issue',
  dependency: 'dependency',
  local_git: 'local_git',
  your_new_category: 'your_new_category'
}.freeze
```

After completing these steps, [create a new provider](add_context_provider.md) for your new category.
