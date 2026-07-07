# Language Server Unified Webview

A modern, unified webview application for GitLab Language Server, built with Vue 3, TypeScript, Tailwind CSS v4, and shadcn-vue.

## Local Development

### Running the webview

```bash
# From repository root
bun install

cd apps/webview
bun run dev
```

### Testing

```bash
bun run test         # Run all tests
bun run test:unit    # Run unit tests
bun run type-check   # TypeScript type checking
bun run lint         # ESLint
```

### Build

```bash
bun run build
```

### Storybook

```bash
bun run storybook    # Build and launch storybook to see the components in the browser
```

To run storybook interaction tests:

```bash
bun run test:storybook
```

## Integration with Language Server

### Build Output

The webview builds to `/out/webviews/root/` and is served at the base path `/webview/root/` in the node.js version of the language server.

### Message Bus Communication

TBD

## Project Structure

### Key Directories

```text
apps/webview/
├── src/
│   ├── components/       # Shared UI components (shadcn-vue)
│   ├── features/         # Feature-specific implementations
│   ├── router/           # Vue Router configuration
│   ├── stores/           # Pinia state management
│   └── main.ts           # Application entry point
```

### Tech Stack

- Vue 3.5, TypeScript 5.9, Tailwind CSS v4, shadcn-vue, Vite 7, Vitest, Pinia
