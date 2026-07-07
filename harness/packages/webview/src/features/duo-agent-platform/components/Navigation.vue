<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { History, Plus, Undo2 } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useHealthCheckStore } from '../stores/healthCheckStore.ts';
import ProjectSelector from './ProjectSelector.vue';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ui/navigation-menu';
import TooltipProvider from '@/components/ui/tooltip/TooltipProvider.vue';
import Tooltip from '@/components/ui/tooltip/Tooltip.vue';
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue';
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue';

const router = useRouter();

const canGoBack = ref(false);

const stopTrackBack = router.afterEach((_to, from) => {
  canGoBack.value = Boolean(from.name);
});

const { isHealthLoading, showHealthCheckError } = storeToRefs(useHealthCheckStore());

const isDisabled = computed(() => isHealthLoading.value || showHealthCheckError.value);
const canGoBackEnabled = computed(() => canGoBack.value && !isDisabled.value);

function handleBackClick() {
  if (!canGoBackEnabled.value) return;
  router.go(-1);
}

function guardNavigate(event: MouseEvent) {
  if (isDisabled.value) event.preventDefault();
}

onUnmounted(() => {
  stopTrackBack();
});
</script>

<template>
  <NavigationMenu class="p-3 justify-between w-full">
    <NavigationMenuList>
      <NavigationMenuItem>
        <NavigationMenuLink as-child class="p-0.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Undo2
                  @click="handleBackClick"
                  class="h-6 w-6"
                  :class="canGoBackEnabled ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'"
                  :aria-disabled="!canGoBackEnabled"
                />
              </TooltipTrigger>
              <TooltipContent>Go back</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
    <NavigationMenuList>
      <NavigationMenuItem>
        <NavigationMenuLink as-child class="p-0.5">
          <router-link
            :to="{ name: 'chat', params: {} }"
            :class="{ 'cursor-not-allowed opacity-40': isDisabled }"
            :tabindex="isDisabled ? -1 : undefined"
            :aria-disabled="isDisabled"
            @click.capture="guardNavigate"
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Plus class="h-6 w-6" />
                </TooltipTrigger>
                <TooltipContent>New chat</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </router-link>
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink as-child class="p-0.5">
          <router-link
            :to="{ name: 'duo-history' }"
            :class="{ 'cursor-not-allowed opacity-40': isDisabled }"
            :tabindex="isDisabled ? -1 : undefined"
            :aria-disabled="isDisabled"
            @click.capture="guardNavigate"
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as-child> <History class="h-6 w-6" /> </TooltipTrigger>
                <TooltipContent>History</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </router-link>
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <ProjectSelector />
      </NavigationMenuItem>
    </NavigationMenuList>
  </NavigationMenu>
</template>
