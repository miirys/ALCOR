/**
 * Calculates the byte limit for context content based on Anthropic's model constraints.
 * Based on the gitlab-org/gitlab implementation, although it has been updated to work on byte size vs character count.
 * See ruby implementation for further details, e.g.:
 * https://gitlab.com/gitlab-org/gitlab/blob/master/ee/lib/gitlab/llm/chain/concerns/anthropic_prompt.rb
 * https://gitlab.com/gitlab-org/gitlab/blob/master/ee/app/serializers/ee/merge_request_ai_entity.rb
 *
 * @param splitContentBetweenNumItems - the number of context items attached to this message. The content limit will be split between them.
 * @returns Maximum number of bytes allowed for context content
 */

export function getAdvancedContextContentLimit(splitContentBetweenNumItems: number): number {
  // For ASCII text, 1 char = 1 byte
  // Anthropic states ~3.5 chars per token for English: https://docs.anthropic.com/en/docs/resources/glossary#tokens
  // We use 3 for a conservative estimate since non-English/special chars may take more bytes
  const bytesPerToken = 3;
  const totalModelTokenLimit = 100000;
  const inputTokenLimit = Math.floor(totalModelTokenLimit * 0.8);
  const maxBytes = inputTokenLimit * bytesPerToken;
  const contentSize = maxBytes * 0.6; // Context content limit is 60% of max bytes

  return Math.floor(contentSize / splitContentBetweenNumItems);
}
