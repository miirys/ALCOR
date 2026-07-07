<script setup lang="ts">
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
</script>
<template>
  <div>
    <Separator />
    <Skeleton class="h-4 w-48 mt-4" />
    <div class="flex justify-between items-center mt-2">
      <Skeleton class="h-6 w-64" />
      <Skeleton class="h-10 w-10 rounded-md" />
    </div>
    <Skeleton class="h-4 w-full mt-2 mb-5" />
  </div>
</template>
