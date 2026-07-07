<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useHealthCheckStore } from '../../stores/healthCheckStore';
import HealthCheckItem from './HealthCheckItem.vue';
import {
  PERMISSIONS_ERROR,
  UNKNOWN_ERROR,
  USER_PERMISSIONS_ERROR,
  type HealthCheckErrorState,
} from './constants';
import { ERROR_STATES } from './errorStates';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

defineProps<{ projectPath?: string }>();

const { healthChecks, currentState } = storeToRefs(useHealthCheckStore());

// Only mounted for error states (gated by showHealthCheckError); the fallback keeps the view total
// for the loading/ready values currentState can also hold.
const state = computed(
  () => ERROR_STATES[currentState.value as HealthCheckErrorState] ?? ERROR_STATES[UNKNOWN_ERROR],
);
const isPermissionsError = computed(() => currentState.value === PERMISSIONS_ERROR);
const showProjectPath = computed(
  () => currentState.value === PERMISSIONS_ERROR || currentState.value === USER_PERMISSIONS_ERROR,
);
</script>

<template>
  <Empty class="my-auto" data-testid="workflow-health-check">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <component :is="state.icon" />
      </EmptyMedia>
      <EmptyTitle>{{ state.title }}</EmptyTitle>
      <EmptyDescription v-for="(line, index) in state.description" :key="index">
        {{ line }}
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent v-if="showProjectPath || isPermissionsError">
      <p v-if="showProjectPath && projectPath" class="font-medium">{{ projectPath }}</p>
      <ul v-if="isPermissionsError" class="flex flex-col gap-3 text-left">
        <HealthCheckItem v-for="check in healthChecks" :key="check.name" :item="check" />
      </ul>
    </EmptyContent>
  </Empty>
</template>
