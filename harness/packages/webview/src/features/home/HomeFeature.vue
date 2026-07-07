<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useHomeFeature } from './composables/useHomeFeature';
import { Button } from '@/components/ui/button';

const router = useRouter();
const { handleButtonClick, appInfo } = useHomeFeature();

const navigateToMcp = () => {
  router.push('/mcp');
};

const navigateToDuoChat = () => {
  router.push('./duoAgentPlatform');
};
</script>

<template>
  <div class="home-feature p-8">
    <div class="max-w-4xl mx-auto space-y-6">
      <header class="text-center space-y-4">
        <h1
          class="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"
        >
          {{ appInfo.title }}
        </h1>
        <p class="text-muted-foreground text-lg">{{ appInfo.description }}</p>
      </header>

      <div class="flex flex-col items-center gap-4 py-8">
        <div class="flex gap-4">
          <Button @click="handleButtonClick" variant="default">Get Started</Button>
          <Button
            variant="outline"
            as="a"
            href="https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp"
            target="_blank"
            rel="noopener noreferrer"
          >
            View Documentation
          </Button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-8">
        <div
          class="p-6 border rounded-lg space-y-2 hover:border-primary/50 transition-colors cursor-pointer"
          @click="navigateToMcp"
        >
          <h3 class="font-semibold">MCP Dashboard</h3>
          <p class="text-sm text-muted-foreground">
            Manage Model Context Protocol servers and tools
          </p>
        </div>
        <div
          class="p-6 border rounded-lg space-y-2 hover:border-primary/50 transition-colors cursor-pointer"
          @click="navigateToDuoChat"
        >
          <h3 class="font-semibold">Duo Agent Platform</h3>
        </div>
        <div class="p-6 border rounded-lg space-y-2 hover:border-primary/50 transition-colors">
          <h3 class="font-semibold">Vue 3 + TypeScript</h3>
          <p class="text-sm text-muted-foreground">
            Modern development with Composition API and full type safety
          </p>
        </div>
        <div class="p-6 border rounded-lg space-y-2 hover:border-primary/50 transition-colors">
          <h3 class="font-semibold">Tailwind CSS v4</h3>
          <p class="text-sm text-muted-foreground">Utility-first CSS with native CSS variables</p>
        </div>
        <div class="p-6 border rounded-lg space-y-2 hover:border-primary/50 transition-colors">
          <h3 class="font-semibold">shadcn-vue</h3>
          <p class="text-sm text-muted-foreground">Beautiful, accessible component library</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-feature {
  min-height: 100vh;
  background: linear-gradient(to bottom, transparent, hsl(var(--muted) / 0.3));
}
</style>
