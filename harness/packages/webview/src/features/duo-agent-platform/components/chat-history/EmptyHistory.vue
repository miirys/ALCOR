<script setup lang="ts">
import ScheduleIllustration from '@gitlab/svgs/dist/illustrations/schedule-md.svg';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
</script>
<template>
  <Empty>
    <EmptyHeader>
      <img
        :src="ScheduleIllustration"
        :alt="'Clock icon with circular arrow, indicating chat history or time-based functionality'"
        class="gl-mb-5"
        data-testid="empty-state-illustration"
      />
      <EmptyTitle> See your chat history </EmptyTitle>
      <EmptyDescription> Your previous chats will appear here. </EmptyDescription>
    </EmptyHeader>
  </Empty>
</template>
