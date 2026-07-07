import { gql } from 'graphql-request';
import { Disposable } from '@gitlab-org/disposable';
import { GitLabApiService, GraphQLRequest, UserService } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import {
  type AIContextItem,
  AIContextCategory,
  type ChatContextManager,
} from '@gitlab-org/ai-context';
import { AiCompletionResponseChannel } from '../api/graphql/ai_completion_response_channel';
import { log } from '../log';
import { ifVersionGte } from '../utils/if_version_gte';
import { PLATFORM_ORIGIN, SPECIAL_MESSAGES } from '../constants';
import { ChatSubscription, ChatSubscriptionCallbacks } from './chat_subscription';
import { ActiveFileContext } from './gitlab_chat_record_context';
import { pullHandler } from './api/pulling';

const MINIMUM_PLATFORM_ORIGIN_FIELD_VERSION = '17.3.0';
const MINIMUM_ADDITIONAL_CONTEXT_FIELD_VERSION = '17.5.0-pre';

export const CHAT_INPUT_TEMPLATE_17_2_AND_EARLIER = {
  query: gql`
    mutation chat(
      $question: String!
      $resourceId: AiModelID
      $currentFileContext: AiCurrentFileInput
      $clientSubscriptionId: String
    ) {
      aiAction(
        input: {
          chat: { resourceId: $resourceId, content: $question, currentFile: $currentFileContext }
          clientSubscriptionId: $clientSubscriptionId
        }
      ) {
        requestId
        errors
      }
    }
  `,
  defaultVariables: {},
};

export const CHAT_INPUT_TEMPLATE_17_3_AND_LATER = {
  query: gql`
    mutation chat(
      $question: String!
      $resourceId: AiModelID
      $currentFileContext: AiCurrentFileInput
      $clientSubscriptionId: String
      $platformOrigin: String!
    ) {
      aiAction(
        input: {
          chat: { resourceId: $resourceId, content: $question, currentFile: $currentFileContext }
          clientSubscriptionId: $clientSubscriptionId
          platformOrigin: $platformOrigin
        }
      ) {
        requestId
        errors
      }
    }
  `,
  defaultVariables: {
    platformOrigin: PLATFORM_ORIGIN,
  },
};

export const CHAT_INPUT_TEMPLATE_17_5_AND_LATER = {
  query: gql`
    mutation chat(
      $question: String!
      $resourceId: AiModelID
      $currentFileContext: AiCurrentFileInput
      $clientSubscriptionId: String
      $platformOrigin: String!
      $additionalContext: [AiAdditionalContextInput!]
    ) {
      aiAction(
        input: {
          chat: {
            resourceId: $resourceId
            content: $question
            currentFile: $currentFileContext
            additionalContext: $additionalContext
          }
          clientSubscriptionId: $clientSubscriptionId
          platformOrigin: $platformOrigin
        }
      ) {
        requestId
        errors
      }
    }
  `,
  defaultVariables: {
    platformOrigin: PLATFORM_ORIGIN,
  },
};

export type AiActionResponseType = {
  aiAction: { requestId: string; errors: string[] };
};

export type AiActionError = {
  response?: {
    errors?: {
      message?: string;
    }[];
  };
};

export type AIActionResult = {
  actionResponse: AiActionResponseType | null;
  error: AiActionError | unknown;
};

export const AI_MESSAGES_QUERY = gql`
  query getAiMessages($requestIds: [ID!], $roles: [AiMessageRole!]) {
    aiMessages(requestIds: $requestIds, roles: $roles) {
      nodes {
        requestId
        role
        content
        contentHtml
        timestamp
        errors
        extras {
          sources
        }
      }
    }
  }
`;

// TODO: update this query to include additional context
// https://gitlab.com/gitlab-org/gitlab/-/issues/489304
const AI_MESSAGES_QUERY_17_5_AND_LATER = gql`
  query getAiMessages($requestIds: [ID!], $roles: [AiMessageRole!]) {
    aiMessages(requestIds: $requestIds, roles: $roles) {
      nodes {
        requestId
        role
        content
        contentHtml
        timestamp
        errors
        extras {
          sources
          additionalContext {
            id
            category
            metadata
          }
        }
      }
    }
  }
`;

type AiMessageResponseType = {
  requestId: string;
  role: string;
  content: string;
  timestamp: string;
  errors: string[];
  extras?: {
    sources: object[];
  };
  additionalContext?: AIContextItem[];
};

export type AiContextItemRequestType = Omit<AIContextItem, 'category'> & {
  // GraphQL expects uppercase category, e.g. 'FILE' and 'SNIPPET', internally we use lowercase 'file' and 'snippet'
  category: Uppercase<AIContextCategory>;
};

type AiMessagesResponseType = {
  aiMessages: {
    nodes: AiMessageResponseType[];
  };
};

interface ErrorMessage {
  type: 'error';
  requestId: string;
  role: 'system';
  errors: string[];
}

const errorResponse = (requestId: string, errors: string[]): ErrorMessage => ({
  requestId,
  errors,
  role: 'system',
  type: 'error',
});

interface SuccessMessage {
  type: 'message';
  requestId: string;
  role: string;
  content: string;
  timestamp: string;
  errors: string[];
  extras?: {
    sources: object[];
    additionalContext?: AIContextItem[];
  };
}

const successResponse = (response: AiMessageResponseType): SuccessMessage => ({
  type: 'message',
  ...response,
});

type AiMessage = SuccessMessage | ErrorMessage;

type ChatInputTemplate = {
  query: string;
  defaultVariables: {
    platformOrigin?: string;
  };
};

export class GitLabChatApi {
  #cachedActionMutation?: ChatInputTemplate = undefined;

  #cachedMessagesQuery?: string = undefined;

  #client: GitLabApiService;

  #logger: Logger;

  #chatContextManager: ChatContextManager;

  #userService: UserService;

  constructor(
    apiClient: GitLabApiService,
    chatContextManager: ChatContextManager,
    logger: Logger,
    userService: UserService,
  ) {
    this.#client = apiClient;
    this.#chatContextManager = chatContextManager;
    this.#logger = logger;
    this.#userService = userService;
  }

  async processNewUserPrompt(
    question: string,
    subscriptionId?: string,
    currentFileContext?: ActiveFileContext,
    aiContextItems?: AIContextItem[],
  ): Promise<AiActionResponseType> {
    return this.#sendAiAction({
      question,
      currentFileContext,
      additionalContext: aiContextItems?.map((item) => ({
        id: item.id,
        // GraphQL expects uppercase category, e.g. 'FILE' and 'SNIPPET', internally we use lowercase 'file' and 'snippet'
        category: item.category.toUpperCase() as Uppercase<AIContextCategory>,
        // we can safely assume that the content will be populated, by this point
        content: item.content ?? '',
        metadata: item.metadata,
      })),
      clientSubscriptionId: subscriptionId,
    });
  }

  async pullAiMessage(requestId: string, role: string): Promise<AiMessage> {
    const response = await pullHandler(() => this.#getAiMessage(requestId, role));

    if (!response) return errorResponse(requestId, ['Reached timeout while fetching response.']);

    return successResponse(response);
  }

  async clearChat(): Promise<AiActionResponseType> {
    return this.#sendAiAction({ question: SPECIAL_MESSAGES.CLEAR });
  }

  async resetChat(): Promise<AiActionResponseType> {
    return this.#sendAiAction({ question: SPECIAL_MESSAGES.RESET });
  }

  /**
   * Creates a subscription for receiving streaming chat responses.
   * This method handles all the complexity of channel creation, version-specific
   * configuration, and user authentication.
   *
   * The caller is responsible for managing the subscription lifecycle (disposing
   * when done or when a new subscription is needed).
   *
   * @returns A Disposable that cleans up the subscription when disposed.
   */
  async createSubscription(
    subscriptionId: string,
    callbacks: ChatSubscriptionCallbacks,
  ): Promise<Disposable> {
    const userId = this.#userService.user?.id;
    if (!userId) {
      throw new Error(`Couldn't get user id for account`);
    }

    const additionalContextEnabled = await this.#isAdditionalContextEnabled();

    this.#logger.debug(
      `GitLabChatApi: createSubscription, additionalContextEnabled: ${additionalContextEnabled}`,
    );

    const channel = new AiCompletionResponseChannel(
      {
        htmlResponse: false,
        userId,
        aiAction: 'CHAT',
        clientSubscriptionId: subscriptionId,
      },
      additionalContextEnabled,
    );

    const subscription = new ChatSubscription(this.#client, this.#logger);
    await subscription.subscribe(channel, callbacks);
    return subscription;
  }

  async #getAiMessage(requestId: string, role: string): Promise<AiMessageResponseType | undefined> {
    const query = await this.#messagesQuery();
    const request: GraphQLRequest<AiMessagesResponseType> = {
      type: 'graphql',
      query,
      variables: { requestIds: [requestId], roles: [role.toUpperCase()] },
    };

    const history = await this.#client.fetchFromApi(request);

    return history.aiMessages.nodes[0];
  }

  async #sendAiAction(variables: {
    question: string;
    subscriptionId?: string;
    currentFileContext?: ActiveFileContext;
    additionalContext?: AiContextItemRequestType[];
    clientSubscriptionId?: string;
  }): Promise<AiActionResponseType> {
    const { query, defaultVariables } = await this.#actionMutation();
    // TODO: get active project id
    const projectGqlId = null;
    const request: GraphQLRequest<AiActionResponseType> = {
      type: 'graphql',
      query,
      variables: {
        ...variables,
        ...defaultVariables,
        resourceId: projectGqlId ?? null,
      },
    };

    return this.#client.fetchFromApi(request);
  }

  async #actionMutation(): Promise<ChatInputTemplate> {
    if (!this.#cachedActionMutation) {
      try {
        const isAdditionalContextEnabled = await this.#isAdditionalContextEnabled();

        if (!this.#gitLabVersion) {
          throw new Error('Unknown instance version.');
        }
        const settings = {
          version: this.#gitLabVersion,
          isAdditionalContextEnabled,
          actionMutation: ifVersionGte<ChatInputTemplate>(
            this.#gitLabVersion,
            MINIMUM_PLATFORM_ORIGIN_FIELD_VERSION,
            () =>
              isAdditionalContextEnabled
                ? CHAT_INPUT_TEMPLATE_17_5_AND_LATER
                : CHAT_INPUT_TEMPLATE_17_3_AND_LATER,
            () => CHAT_INPUT_TEMPLATE_17_2_AND_EARLIER,
          ),
        };
        this.#cachedActionMutation = settings.actionMutation;
        log.debug(`GitLabChatApi: action mutation settings: ${JSON.stringify(settings, null, 2)}`);
      } catch (e) {
        log.debug(`GitLab version check for sending chat failed:`, e);
        this.#cachedActionMutation = CHAT_INPUT_TEMPLATE_17_3_AND_LATER;
      }
    }

    return this.#cachedActionMutation;
  }

  async #messagesQuery(): Promise<string> {
    if (!this.#cachedMessagesQuery) {
      try {
        const isAdditionalContextEnabled = await this.#isAdditionalContextEnabled();

        if (!this.#gitLabVersion) {
          throw new Error('Unknown instance version.');
        }
        const settings = {
          version: this.#gitLabVersion,
          isAdditionalContextEnabled,
          messagesQuery: ifVersionGte<string>(
            this.#gitLabVersion,
            MINIMUM_ADDITIONAL_CONTEXT_FIELD_VERSION,
            () => AI_MESSAGES_QUERY_17_5_AND_LATER,
            () => AI_MESSAGES_QUERY,
          ),
        };
        this.#cachedMessagesQuery = settings.messagesQuery;
        log.debug(`GitChatApi: messages query settings: ${JSON.stringify(settings, null, 2)}`);
      } catch (e) {
        log.debug(`GitLab version check for sending chat failed:`, e);
        this.#cachedMessagesQuery = AI_MESSAGES_QUERY;
      }
    }

    return this.#cachedMessagesQuery;
  }

  get #gitLabVersion(): string | undefined {
    return this.#client.instanceInfo?.instanceVersion;
  }

  async #isAdditionalContextEnabled() {
    try {
      const categories = await this.#chatContextManager.getAvailableCategories();
      return categories && categories.length > 0;
    } catch (error) {
      log.error('Error checking if additional context is enabled', error);
      return false;
    }
  }
}
