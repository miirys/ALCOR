<script setup lang="ts">
import EmptySearchIllustration from '@gitlab/svgs/dist/illustrations/empty-state/empty-search-md.svg';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
</script>
<template>
  <Empty>
    <EmptyHeader>
      <img
        :src="EmptySearchIllustration"
        :alt="'Magnifying glass icon, indicating empty results found'"
        class="gl-mb-5"
        data-testid="empty-state-illustration"
      />
      <EmptyTitle> No results found </EmptyTitle>
      <EmptyDescription> Edit your search and try again. </EmptyDescription>
    </EmptyHeader>
  </Empty>
</template>
