import { truncateToByteLimit } from '@gitlab-org/core';
import type { IssuableDetails, IssuableDiscussionNote } from '../../services/gitlab';

export function formatIssuableHeader(issuable: IssuableDetails, typeLabel: string): string {
  return `Please use this information about identified ${typeLabel}:
Title: ${issuable.title}
State: ${issuable.state}
${issuable.description ? `Description: ${issuable.description}\n` : ''}
Web URL: ${issuable.webUrl}`;
}

/**
 * Formats an array of issuable notes ready to be included in the prompt / attached to a context item content.
 * Notes are sorted, and truncated based on the provided byte size limit.
 * @param notes Array of issuable notes to format
 * @param byteLimit The byte size limit for the formatted output
 */
export function formatIssuableNotes(notes: IssuableDiscussionNote[], byteLimit: number): string {
  const sortedNotes = [...notes].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const formattedText = sortedNotes.map((note) => note.body).join('\n\n');

  return truncateToByteLimit(formattedText, byteLimit);
}
