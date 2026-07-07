<script setup lang="ts">
import { AlertCircleIcon } from 'lucide-vue-next';
import { useUsageQuotaStore } from '../stores/usageQuotaStore';
import Button from '@/components/ui/button/Button.vue';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface Props {
  inline?: boolean;
}

withDefaults(defineProps<Props>(), { inline: false });

const usageQuotaStore = useUsageQuotaStore();
</script>

<template>
  <Alert
    variant="info"
    aria-live="polite"
    class="items-baseline"
    :class="[inline ? 'bg-transparent border-transparent shadow-none' : '']"
  >
    <AlertCircleIcon />

    <AlertTitle class="text-lg">No credits remain for this billing period.</AlertTitle>
    <AlertDescription :class="[inline ? 'text-card-foreground' : '']">
      <p>Contact your administrator for more credits, or switch to Non-Agentic Chat to continue.</p>
      <p class="mt-2">When you have more credits, refresh.</p>
      <Button variant="primary" size="sm" class="mt-3" @click="usageQuotaStore.checkUsageQuota()">
        Refresh
      </Button>
    </AlertDescription>
  </Alert>
</template>
