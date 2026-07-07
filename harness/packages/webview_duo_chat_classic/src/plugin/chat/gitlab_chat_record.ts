import { v4 as uuidv4 } from 'uuid';
import type { AIContextItem, ChatContextManager } from '@gitlab-org/ai-context';
import { log } from '../log';
import { SPECIAL_MESSAGES } from '../constants';
import { trimActiveFileContext } from '../utils/trim_active_file_context';
import { ActiveFileContext, GitLabChatRecordContext } from './gitlab_chat_record_context';

type ChatRecordRole = 'user' | 'assistant' | 'system';
type ChatRecordState = 'pending' | 'ready';
export type ChatRecordType =
  | 'general'
  | 'explainCode'
  | 'explainTerminalOutput'
  | 'generateTests'
  | 'refactorCode'
  | 'newConversation'
  | 'fixCode'
  | 'focusChat';

type GitLabChatRecordAttributes = {
  chunkId?: number | null;
  type?: ChatRecordType;
  role: ChatRecordRole;
  content?: string;
  requestId?: string;
  state?: ChatRecordState;
  errors?: string[];
  timestamp?: string;
  activeFileContext?: ActiveFileContext;
  extras?: {
    sources: object[];
    contextItems?: AIContextItem[];
  };
};

export class GitLabChatRecord {
  chunkId?: number | null;

  role: ChatRecordRole;

  content?: string;

  id: string;

  requestId?: string;

  state: ChatRecordState;

  timestamp: number;

  type: ChatRecordType;

  errors: string[];

  extras?: {
    sources: object[];
    contextItems?: AIContextItem[];
  };

  context?: GitLabChatRecordContext;

  constructor({
    chunkId,
    type,
    role,
    content,
    state,
    requestId,
    errors,
    timestamp,
    extras,
    activeFileContext,
  }: GitLabChatRecordAttributes) {
    this.chunkId = chunkId;
    this.role = role;
    this.content = content;
    this.type = type ?? this.#detectType();
    this.state = state ?? 'ready';
    this.requestId = requestId;
    this.errors = errors ?? [];
    this.id = uuidv4();
    this.timestamp = timestamp ? Date.parse(timestamp) : Date.now();
    this.extras = extras;
    if (activeFileContext) {
      const trimmedActiveFileContext = trimActiveFileContext(activeFileContext);
      this.context = { currentFile: trimmedActiveFileContext };
    }
  }

  static async buildWithContext(
    attributes: GitLabChatRecordAttributes,
    chatContextManager: ChatContextManager,
  ): Promise<GitLabChatRecord> {
    const record = new GitLabChatRecord(attributes);
    try {
      const contextItems = await chatContextManager.retrieveContextItemsWithContent();
      log.info(`Retrieved ${contextItems.length} context items`);
      if (!record.extras) {
        record.extras = { sources: [], contextItems: [] };
      }
      record.extras.contextItems = contextItems;
    } catch (error) {
      log.error('Error retrieving AI context items', error);
    }

    return record;
  }

  update(attributes: Partial<GitLabChatRecordAttributes>) {
    const convertedAttributes = attributes as Partial<GitLabChatRecord>;
    if (attributes.timestamp) {
      convertedAttributes.timestamp = Date.parse(attributes.timestamp);
    }
    Object.assign(this, convertedAttributes);
  }

  #detectType(): ChatRecordType {
    if (this.content === SPECIAL_MESSAGES.RESET) {
      return 'newConversation';
    }

    return 'general';
  }
}
