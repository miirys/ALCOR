<script setup lang="ts">
import * as vue from 'vue';
import {
  ChevronDown,
  ChevronUp,
  Lightbulb,
  GitPullRequestArrow,
  KeyRound,
  Briefcase,
  ScrollText,
  Sparkle,
  Bug,
  WandSparkles,
  FlaskConical,
} from 'lucide-vue-next';
import { SuggestedTask } from '../types';
import { randomizeArrayToNItems } from '../utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';

type SuggestionsEvents = {
  'populate-prompt': [task: SuggestedTask];
};

const emit = defineEmits<SuggestionsEvents>();

const isOpen = vue.ref(true);

const predefinedSuggestedTasks: SuggestedTask[] = [
  {
    title: 'Change password',
    iconComponent: KeyRound,
    prompt: 'How do I change my password in GitLab?',
  },
  {
    title: 'Summarize code',
    iconComponent: ScrollText,
    prompt: 'Can you summarize the code in this file?',
  },
  {
    title: 'Make code more efficient',
    iconComponent: WandSparkles,
    prompt: 'How can I make this code more efficient?',
  },
  {
    title: 'Find bugs in code',
    iconComponent: Bug,
    prompt: 'Are there any bugs in this code',
  },
  {
    title: 'Create documentation',
    iconComponent: ScrollText,
    prompt: 'Create documentation for this code',
  },
  {
    title: 'Explain this function',
    iconComponent: Sparkle,
    prompt: 'Explain this function step by step',
  },
  {
    title: 'Write unit tests',
    iconComponent: FlaskConical,
    prompt: 'Write unit tests for this function',
  },
  {
    title: 'Add error handling',
    iconComponent: Sparkle,
    prompt: 'Add error handling to this code',
  },
  {
    title: 'Make code more readable',
    iconComponent: Sparkle,
    prompt: 'Make this code more readable',
  },
  {
    title: 'Find performance bottlenecks',
    iconComponent: Sparkle,
    prompt: 'Find performance bottlenecks in this code',
  },
  {
    title: 'Generate a commit message',
    iconComponent: Briefcase,
    prompt: 'Generate a commit message for these changes',
  },
  {
    title: 'Optimize SQL query',
    iconComponent: WandSparkles,
    prompt: 'Optimize this SQL query',
  },
  {
    title: 'Suggest improvements for the code',
    iconComponent: Sparkle,
    prompt: 'Suggest improvements for this code',
  },
  {
    title: 'Organize projects',
    iconComponent: Briefcase,
    prompt: 'How can I organize projects effectively in GitLab?',
  },
  {
    title: 'Manage environment variables',
    iconComponent: Briefcase,
    prompt: 'How do I manage environment variables?',
  },
  {
    title: 'Securely store secrets',
    iconComponent: GitPullRequestArrow,
    prompt: 'How do I securely store secrets in GitLab CI/CD?',
  },
  {
    title: 'Make CI pipelines run faster',
    iconComponent: GitPullRequestArrow,
    prompt: 'How do I make my CI pipelines run faster?',
  },
  {
    title: 'Debug issues with GitLab runners',
    iconComponent: GitPullRequestArrow,
    prompt: 'How do I debug issues with GitLab runners?',
  },
  {
    title: 'Set up quality gates',
    iconComponent: GitPullRequestArrow,
    prompt: 'How do I set up quality gates in my pipeline?',
  },
  {
    title: 'Structure complex epics',
    iconComponent: Briefcase,
    prompt: 'How should I structure complex epics?',
  },
];

const randomizedPredefinedPrompts = randomizeArrayToNItems(predefinedSuggestedTasks, 4);
</script>
<template>
  <Collapsible v-model:open="isOpen">
    <CollapsibleTrigger as-child class="my-4">
      <h4 class="flex justify-items-start items-center hover:cursor-pointer">
        <component :is="isOpen ? ChevronDown : ChevronUp" class="h-4 w-4" />
        <Lightbulb class="h-4 w-4" />
        <span class="uppercase font-bold">Suggested tasks</span>
      </h4>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div v-for="(taskRecord, index) in randomizedPredefinedPrompts" :key="index">
        <Button
          variant="secondary"
          class="flex items-start w-full text-left h-auto mb-3 px-4 py-3 rounded-md justify-start hover:cursor-pointer"
          :data-testid="`suggestion-button-${index}`"
          @click="emit('populate-prompt', taskRecord)"
        >
          <component
            :is="taskRecord.iconComponent"
            class="pt-2 w-7 h-7 size-6 text-secondary-foreground/60"
          />
          <span>
            <strong class="text-base font-normal">{{ taskRecord.title }}</strong>
            <span
              class="block text-sm font-normal text-secondary-foreground/60"
              data-testid="suggestion-prompt"
              >{{ taskRecord.prompt }}</span
            >
          </span>
        </Button>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
