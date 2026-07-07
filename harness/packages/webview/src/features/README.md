# Features Directory

This directory contains all feature-specific implementations for the unified webview.

## Structure

Each feature should follow this structure:

```text
feature-name/
├── FeatureName.vue    # Main feature component
├── index.ts           # Barrel export file
├── components/        # Feature-specific components
├── composables/       # Feature-specific composables
├── types/            # Feature-specific TypeScript types
└── stores/           # Feature-specific Pinia stores (if needed)
```

## Feature Guidelines

### 1. Self-Contained Features

Each feature should be as self-contained as possible, with its own:

- Components
- Business logic (composables)
- Type definitions
- State management (if needed)

### 2. Shared Resources

Features can use shared resources from:

- `@/components/ui` - shadcn-vue components
- `@/lib` - Common utilities
- `@/stores` - Global state stores

### 3. Feature Communication

Features can communicate through:

- **Router navigation**: Navigate between features
- **Global stores**: Share state via Pinia stores
- **Event bus**: For decoupled communication (if implemented)
- **Props/Events**: When one feature embeds another

### 4. Lazy Loading

Features are lazy-loaded via dynamic imports in the router configuration.

## Example: Creating a New Feature

1. Create feature directory:

```bash
mkdir -p src/features/my-feature/{components,composables,types}
```

1. Create the main feature component (`MyFeature.vue`):

```vue
<script setup lang="ts">
import { useMyFeature } from './composables/useMyFeature';

const { state, actions } = useMyFeature();
</script>

<template>
  <div class="my-feature">
    <!-- Feature content -->
  </div>
</template>
```

1. Create the barrel export (`index.ts`):

```typescript
export { default as MyFeature } from './MyFeature.vue';
export * from './composables/useMyFeature';
```

1. Add to router:

```typescript
{
  path: '/my-feature',
  name: 'my-feature',
  component: () => import('@/features/my-feature').then((m) => m.MyFeature),
}
```

## Feature Composition Example

Features can render other features:

```vue
<script setup lang="ts">
// Parent feature can dynamically load child features
import { defineAsyncComponent } from 'vue';

const ChatFeature = defineAsyncComponent(
  () => import('@/features/chat/index.vue')
);
</script>

<template>
  <div class="parent-feature">
    <ChatFeature v-if="showChat" />
  </div>
</template>
```
