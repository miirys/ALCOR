import { type AIContextItem, ChatContextManager, DuoChatAIRequest } from '@gitlab-org/ai-context';

export const initAIContextController = (chatContextManager: ChatContextManager) => {
  const refreshCurrentContextItems = async () => {
    const data = await chatContextManager.getSelectedContextItems();

    return { eventName: 'setContextCurrentItemsResult' as const, data };
  };

  return {
    async addContextItem(contextItem: AIContextItem) {
      await chatContextManager.addSelectedContextItem(contextItem);

      return refreshCurrentContextItems();
    },

    async removeContextItem(contextItem: AIContextItem) {
      await chatContextManager.removeSelectedContextItem(contextItem);

      return refreshCurrentContextItems();
    },

    async clearSelectedContextItems() {
      await chatContextManager.clearSelectedContextItems();

      return refreshCurrentContextItems();
    },

    async searchContextItems(request: DuoChatAIRequest) {
      try {
        const response = await chatContextManager.searchContextItems(request);
        return { eventName: 'setContextItemSearchResult' as const, data: { results: response } };
      } catch (error: Error | unknown) {
        return {
          eventName: 'setContextItemSearchResult' as const,
          data: { errorMessage: (error as Error).message },
        };
      }
    },

    async getContextCategories() {
      const data = await chatContextManager.getAvailableCategories();
      return { eventName: 'setContextCategoriesResult' as const, data };
    },

    async getSelectedContextItemContent({
      contextItem,
    }: {
      messageId?: string;
      contextItem: AIContextItem;
    }) {
      const hydratedContextItem = await chatContextManager.getItemWithContent(contextItem);
      const currentItems = await chatContextManager.getSelectedContextItems();

      const currentItemsResult = currentItems.map((item) =>
        item.id === contextItem.id ? hydratedContextItem : item,
      );

      return { eventName: 'setContextCurrentItemsResult' as const, data: currentItemsResult };
    },
  };
};
