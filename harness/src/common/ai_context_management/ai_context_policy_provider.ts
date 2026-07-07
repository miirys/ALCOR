import type { AIContextPolicyResponse } from '@gitlab-org/ai-context';
import { AIContextPolicyProvider } from '.';

export abstract class AbstractAIContextPolicyProvider implements AIContextPolicyProvider {
  abstract isContextItemAllowed(relativePath: string): Promise<AIContextPolicyResponse>;
}
