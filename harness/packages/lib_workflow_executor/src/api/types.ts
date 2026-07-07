export type { CreateWorkflowOptions } from '@gitlab-lsp/workflow-api';

export type HeaderData = Record<string, string>;

export interface GenerateTokenResponse {
  server_capabilities?: string[];
  gitlab_rails: {
    base_url: string;
    token: string;
    token_expires_at: string;
  };
  duo_workflow_service: {
    base_url: string;
    token: string;
    secure: boolean;
    token_expires_at: number;
    headers: HeaderData;
  };
  workflow_metadata?: {
    is_team_member: boolean | null;
    extended_logging: boolean;
  };
}

export interface CreateWorkflowResponse {
  id?: number;
  message?: string;
  error?: string;
}

export interface CreateWorkflowEventResponse {
  id: string;
  event_type: string;
  event_status: string;
  message: string;
}
