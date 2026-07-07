import * as vue from 'vue';
import type { Agent } from '@gitlab-org/lib-duo-agent-platform/webview';

// Message Types (based on lib_workflow_api/ui_chat_log.ts)
export type MessageType = 'user' | 'agent' | 'request' | 'tool';

export type SuggestedTask = {
  title: string;
  iconComponent: vue.FunctionalComponent;
  prompt: string;
  // agent is not available yet, placeholder until it's ready
  agent?: Agent;
};
