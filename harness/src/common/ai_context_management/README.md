# AI Context Management

AI Context Management is a crucial component of the GitLab Language Server that enhances AI-powered features by providing relevant contextual information.

## Overview

The AI Context Management system is responsible for:

1. Collecting and managing contextual information from various sources
1. Applying context policies to ensure security and relevance
1. Providing filtered context to AI models for improved results

## Key Components

- **AI Context Providers**: Collect context from different sources (e.g., open files, project dependencies)
- **AI Context Policy Providers**: Enforce rules on what context can be used
- **AI Context Manager**: Coordinates between providers and manages the overall context
- **AI Context Policy Transformers**: Transforms context content before it is sent (e.g. secret redaction)

## AI Context Policy Providers

The system includes the following policy providers:

- **FilePolicyProvider**: Enforces file-based context policies through configuration files (`.ai-context-policy.yml`)
- **DuoExclusionFilePolicyProvider**: Checks files against GitLab Duo Context Exclusion rules configured at the project level, disabling context for excluded files with the reason `DUO_CONTEXT_EXCLUDED`

## Further Documentation

For more detailed information, please refer to the following documents:

- [AI Context Providers](link-to-ai-context-providers-doc)
- [AI Context Policy Providers](link-to-ai-context-policy-providers-doc)
- [Adding a new Context Category to the Backend](./docs/add_context_category_backend.md)
- [Adding a New AI Context Provider](./docs/add_context_provider.md)

## Feedback

We value your input! If you have any questions or suggestions regarding AI Context Management, please [open an issue](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/new).
