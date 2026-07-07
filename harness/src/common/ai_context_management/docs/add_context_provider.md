# Add a new AI Context Provider

This guide explains how to add a new AI Context Provider to the GitLab Language Server project.

AI Context Providers are essential components in the GitLab Language Server that supply context for
AI-powered features like Code Suggestions. This guide will walk you through the process of creating
and integrating a new AI Context Provider.

[[_TOC_]]

## Add a new provider

1. [Add New Provider Type](#add-new-provider-type)
1. [Create a new file](#create-a-new-file)
1. [Define your provider class](#define-your-provider-class)
1. [Update the AI context manager](#update-the-ai-context-manager)
1. [Define feature requirement](#define-feature-requirement)
1. [Implement required methods](#implement-required-methods)
1. [Add necessary dependencies](#add-necessary-dependencies)
1. [Test your provider](#test-your-provider)

### Add new provider type

Before creating your new provider, add its type to the system:

1. Open `/src/common/ai_context_management/index.ts`.

1. Add your new provider type to the `AIContextProviderType` type:

   ```typescript
   export type AIContextProviderType =
     | 'open_tab'
     | 'local_file_search'
     | 'issue'
     | 'merge_request'
     | 'snippet'
     | 'dependency'
     | 'your_new_provider_type';  // Add your new type here
   ```

1. If your provider introduces a new category, add it to the `AIContextCategory` type:

   ```typescript
   // Add your new category if needed.
   // Make sure BE knows how to deal with your new category
   export type AIContextCategory = 'file' | 'snippet' | 'issue' | 'merge_request' | 'dependency' | 'your_new_category';
   ```

### Create a new file

Create a new TypeScript file in the following directory:
`/src/common/ai_context_management/context_providers/your_provider_name.ts`.

### Define your provider class

In your new file, create a class that extends `AbstractAIContextProvider`. Here's a simplified example:

```typescript
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { AbstractAIContextProvider } from '../ai_context_provider';
import { AIContextItem, AIContextItemMetadata, AIContextSearchRequest } from '..';

type YourProviderMetadata = AIContextItemMetadata & {
  subType: 'your_new_provider_type';
  // Add any additional metadata fields
};

export type YourProviderAIContextItem = AIContextItem & {
  category: 'your_new_category';
  metadata: YourProviderMetadata;
};

export interface YourProviderContextProvider extends AbstractAIContextProvider<YourProviderAIContextItem> {}

export const YourProviderContextProvider = createInterfaceId<YourProviderContextProvider>('YourProviderContextProvider');

@Injectable(YourProviderContextProvider, [/* Add any dependencies */])
export class DefaultYourProviderContextProvider
  extends AbstractAIContextProvider<YourProviderAIContextItem>
  implements YourProviderContextProvider
{
  constructor(/* Add any dependencies */) {
    super('your_new_provider_type');
  }

  // Implement required methods here
}
```

### Update the AI context manager

Open `/src/common/ai_context_management/ai_context_manager.ts` and make these changes:

1. Import your new provider:

   ```typescript
   import { YourProviderContextProvider } from './context_providers/your_provider_name';
   ```

1. Add your provider type to the `AIContextMapping`:

   ```typescript
   const AIContextMapping: Record<AIContextCategory, AIContextProviderType[]> = {
     // ...existing mappings
     your_category: ['your_new_provider_type'],
   };
   ```

1. Inject your new provider into the `DefaultChatContextManager` class as a dependency:

   ```typescript
   @Injectable(ChatContextManager, [
     ...
     YourProviderContextProvider,
   ])
   ```

1. Update the `DefaultChatContextManager` constructor to include your new provider:

   ```typescript
   constructor(
     // ...existing providers
     yourProvider: YourProviderContextProvider,
   ) {
     this.#providers.push(
       // ...existing providers
       yourProvider as unknown as AIContextProvider<AIContextItem>,
     );
   }
   ```

### Define feature requirement

In your provider class, select a value for the `duoRequiredFeature` property.

Set to `undefined` if the new provider should always be available:

```typescript
  duoRequiredFeature = undefined;
```

Or extend the `DuoFeature` enum if the provider should only be available if the API says so (e.g. when only available on GitLab Duo Enterprise):

```typescript
  duoRequiredFeature = DuoFeature.IncludeYourNewFeatureTypeContext;
```

### Implement required methods

In your provider class, implement these required methods:

```typescript
async searchContextItems(query: AIContextSearchRequest): Promise<YourProviderAIContextItem[]> {
  const searchRequest = getSearchRequestType(query);
  // Implement search logic
}

async retrieveSelectedContextItemsWithContent(): Promise<YourProviderAIContextItem[]> {
  // Implement retrieval logic
}

async getItemWithContent(item: YourProviderAIContextItem): Promise<YourProviderAIContextItem> {
  // Implement content retrieval logic
}
```

### Add necessary dependencies

If your provider requires additional services or dependencies, inject them in the constructor and
add them to the `@Injectable` decorator.

### Test your provider

1. Create a new test file: `/test/common/ai_context_management/context_providers/your_provider_name.test.ts`
1. Write unit tests for your provider. Here's a simplified example:

   ```typescript
   import { DefaultYourProviderContextProvider } from '../../../../src/common/ai_context_management/context_providers/your_provider_name';

   describe('DefaultYourProviderContextProvider', () => {
     let provider: DefaultYourProviderContextProvider;

     beforeEach(() => {
       provider = new DefaultYourProviderContextProvider(/* mock dependencies */);
     });

     describe('searchContextItems', () => {
       it('should return correct items based on query', async () => {
         const query = { /* mock query */ };
         const result = await provider.searchContextItems(query);
         expect(result).toEqual(/* expected result */);
       });
     });

     // Add more test cases for other methods
   });
   ```

1. Run the tests using the appropriate test command for the project.
