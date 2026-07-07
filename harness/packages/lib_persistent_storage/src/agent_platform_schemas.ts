import { z } from 'zod';

export const SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY = 'selectedAgentPlatformProject';

// Map of repository root path to selected project namespace
export const SelectedAgentPlatformProjectsSchema = z.record(z.string(), z.string());

export type SelectedAgentPlatformProjects = z.infer<typeof SelectedAgentPlatformProjectsSchema>;

// Legacy schema for backward compatibility
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SelectedAgentPlatformProjectSchema = z.object({
  namespaceWithPath: z.string(),
});

export type SelectedAgentPlatformProject = z.infer<typeof SelectedAgentPlatformProjectSchema>;
