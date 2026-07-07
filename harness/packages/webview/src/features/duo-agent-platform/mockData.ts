import type { DuoMessage, DuoWorkflowEdge, DuoWorkflowInfo } from '@gitlab-org/graphql';

export const MOCK_WORKFLOWS: DuoWorkflowInfo[] = [
  {
    id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/1',
    humanStatus: 'input required',
    updatedAt: '2025-12-15T21:39:47Z',
    goal: 'How do I make my CI pipelines run faster?',
    archived: false,
    workflowDefinition: 'duo_chat_test/v1',
    aiCatalogItemVersionId: 'gid://gitlab/Ai::Catalog::ItemVersion/1',
    project: {
      id: 'gid://gitlab/Project/1',
      fullPath: 'gitlab/Project',
    },
    latestCheckpoint: {
      duoMessages: [
        {
          content: 'How do I make my CI pipelines run faster?',
          messageType: 'user',
          toolInfo: null,
        },
        {
          content:
            "Ahoy there, matey! *adjusts tricorn hat* \n\nYe be askin' about speedin' up yer CI pipelines, eh? Let me share some treasure-worthy tips from me years sailin' the DevOps seas! ⚓\n\n## **Fastest Ways to Speed Up Yer CI Pipelines, Arr!**\n\n### 🏴‍☠️ **1. Cache Yer Dependencies Like Buried Treasure**\n- Cache node_modules, pip packages, or whatever dependencies ye be usin'\n- Don't be downloadin' the same booty every time!\n- In GitLab CI, use the `cache:` directive\n\n### ⚡ **2. Parallelize Yer Jobs, Ye Scallywag!**\n- Run independent jobs at the same time\n- Split tests across multiple runners\n- Use `parallel:` in GitLab CI to divide and conquer\n\n### 🎯 **3. Only Run What Ye Need**\n- Use `rules:` or `only:` to skip unnecessary jobs\n- Don't test what hasn't changed, savvy?\n- Implement smart pipeline triggers\n\n### 🐳 **4. Optimize Yer Docker Images**\n- Use smaller base images (alpine variants, arr!)\n- Layer yer Dockerfile wisely\n- Pull from a registry close to yer runners\n\n### 🚀 **5. Use Faster Runners**\n- Upgrade yer GitLab Runner machines\n- Use local runners instead of shared ones\n- Consider cloud runners with more horsepower\n\n### 📦 **6. Incremental Builds**\n- Only build what changed\n- Use build artifacts from previous stages\n- Don't rebuild the whole ship when ye only need to patch the sail!\n\n**Would ye like me to help ye implement any of these strategies in yer GitLab Language Server project, matey?** I can see ye be workin' with TypeScript and such! 🦜",
          messageType: 'agent',
          toolInfo: null,
        },
      ],
    },
  },
  {
    id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/2',
    aiCatalogItemVersionId: null,
    goal: 'Fix bug in payment processing',
    archived: false,
    project: {
      id: 'gid://gitlab/Project/1',
      fullPath: 'gitlab/Project',
    },
    humanStatus: 'created',
    workflowDefinition: 'duo_chat_test/v1',
    updatedAt: '2025-12-12T21:00:00Z',
    latestCheckpoint: {
      duoMessages: [],
    },
  },
  {
    id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/3',
    aiCatalogItemVersionId: null,
    goal: 'Add dark mode support',
    archived: false,
    project: {
      id: 'gid://gitlab/Project/1',
      fullPath: 'gitlab/Project',
    },
    humanStatus: 'created',
    updatedAt: '2025-05-21T04:21:25Z',
    workflowDefinition: 'duo_chat_test/v1',
    latestCheckpoint: {
      duoMessages: [],
    },
  },
  {
    id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/4',
    aiCatalogItemVersionId: null,
    goal: 'Optimize database queries',
    workflowDefinition: 'duo_chat_test/v1',
    project: {
      id: 'gid://gitlab/Project/1',
      fullPath: 'gitlab/Project',
    },
    humanStatus: 'created',
    archived: false,
    latestCheckpoint: {
      duoMessages: [
        {
          content: 'Hello This is User',
          messageType: 'user',
          toolInfo: null,
        },
        {
          content: 'Hello This is Duo Chat',
          messageType: 'agent',
          toolInfo: null,
        },
      ],
    },
    updatedAt: '2025-05-20T14:21:25Z',
  },
];

export const MOCK_WORKFLOWS_EDGES: DuoWorkflowEdge[] = MOCK_WORKFLOWS.map((workflow) => ({
  node: workflow,
}));

export function getMockPageInfo({
  hasNextPage = false,
  hasPreviousPage = false,
}: {
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
} = {}) {
  return {
    startCursor: 'cursor1',
    endCursor: 'cursor2',
    hasNextPage,
    hasPreviousPage,
  };
}
export const MOCK_DUO_MESSAGES: DuoMessage[] = [
  {
    content: 'How can I optimize the performance of my React application?',
    messageType: 'user',
    toolInfo: null,
  },
  {
    content: 'Analyzing React components for performance bottlenecks',
    messageType: 'tool',
    toolInfo:
      '{"args":{"search":"React.memo|useMemo|useCallback","file_pattern":"*.tsx"},"name":"analyze_components","tool_response":{"id":null,"name":"analyze_components","type":"ToolMessage","status":"success","content":"Found 8 components that could benefit from optimization:\\n- ProductList.tsx: Heavy re-renders detected\\n- UserDashboard.tsx: Expensive calculations on every render\\n- ImageGallery.tsx: Large list without virtualization"}}',
  },
  {
    content:
      "I found several areas where you can improve performance:\n\n## Key Optimizations\n\n### 1. Memoize Expensive Calculations\n```jsx\nconst sortedProducts = useMemo(() => {\n  return products.sort((a, b) => b.price - a.price);\n}, [products]);\n```\n\n### 2. Prevent Unnecessary Re-renders\n```jsx\nconst MemoizedProduct = React.memo(ProductCard);\n```\n\n### 3. Use Virtual Scrolling for Large Lists\nFor lists with 100+ items, implement virtualization using libraries like `react-window` or `react-virtualized`.\n\n### 4. Code Splitting\n```jsx\nconst Dashboard = lazy(() => import('./Dashboard'));\n```\n\nWould you like me to help implement any of these optimizations?",
    messageType: 'agent',
    toolInfo: null,
  },
  {
    content: 'Yes, can you help me add virtualization to my product list?',
    messageType: 'user',
    toolInfo: null,
  },
  {
    content: 'Reading ProductList component file',
    messageType: 'tool',
    toolInfo:
      '{"args":{"file_path":"src/components/ProductList.tsx"},"name":"read_file","tool_response":{"id":null,"name":"read_file","type":"ToolMessage","status":"success","content":"export function ProductList({ products }) {\\n  return (\\n    <div className=\\"product-grid\\">\\n      {products.map(product => (\\n        <ProductCard key={product.id} product={product} />\\n      ))}\\n    </div>\\n  );\\n}"}}',
  },
  {
    content:
      "I'll help you add virtualization using `react-window`. Here's the updated implementation:\n\n```tsx\nimport { FixedSizeList } from 'react-window';\n\nexport function ProductList({ products }) {\n  const Row = ({ index, style }) => (\n    <div style={style}>\n      <ProductCard product={products[index]} />\n    </div>\n  );\n\n  return (\n    <FixedSizeList\n      height={600}\n      itemCount={products.length}\n      itemSize={200}\n      width=\"100%\"\n    >\n      {Row}\n    </FixedSizeList>\n  );\n}\n```\n\n**Benefits:**\n- Only renders visible items\n- Handles 10,000+ items smoothly\n- Reduces memory usage by ~90%\n\nDon't forget to install the package:\n```bash\nnpm install react-window\n```",
    messageType: 'agent',
    toolInfo: null,
  },
  {
    content: 'What about SEO considerations?',
    messageType: 'user',
    toolInfo: null,
  },
  {
    content: 'Searching for SEO-related meta tags and configurations',
    messageType: 'tool',
    toolInfo:
      '{"args":{"search":"meta|helmet|title|description","file_pattern":"*.tsx,*.html"},"name":"search_seo","tool_response":{"id":null,"name":"search_seo","type":"ToolMessage","status":"success","content":"Found SEO implementations in:\\n- public/index.html: Basic meta tags\\n- src/components/Layout.tsx: React Helmet usage\\n- Missing: Open Graph tags, structured data"}}',
  },
  {
    content:
      'Good question! Virtualized lists can impact SEO since content isn\'t immediately in the DOM. Here are solutions:\n\n## SEO Best Practices\n\n### 1. Server-Side Rendering (SSR)\nUse Next.js or similar frameworks to render initial content server-side:\n```tsx\nexport async function getServerSideProps() {\n  const products = await fetchProducts();\n  return { props: { products } };\n}\n```\n\n### 2. Add Structured Data\n```tsx\n<script type="application/ld+json">\n  {JSON.stringify({\n    "@context": "https://schema.org",\n    "@type": "ItemList",\n    "itemListElement": products.map((p, i) => ({\n      "@type": "ListItem",\n      "position": i + 1,\n      "item": { "@id": p.url, "name": p.name }\n    }))\n  })}\n</script>\n```\n\n### 3. Meta Tags\n```tsx\n<Helmet>\n  <title>Products - Your Store</title>\n  <meta name="description" content="Browse our collection" />\n  <meta property="og:image" content="/preview.jpg" />\n</Helmet>\n```\n\nFor product pages, ensure each has a unique URL and proper meta tags.',
    messageType: 'agent',
    toolInfo: null,
  },
  {
    content: 'Can you check if my API calls are efficient?',
    messageType: 'user',
    toolInfo: null,
  },
  {
    content: 'Analyzing API request patterns and data fetching',
    messageType: 'tool',
    toolInfo:
      '{"args":{"pattern":"fetch|axios|useQuery","path":"src/api"},"name":"analyze_api","tool_response":{"id":null,"name":"analyze_api","type":"ToolMessage","status":"success","content":"API Analysis Results:\\n- 15 API endpoints found\\n- Issues detected:\\n  * Multiple components fetching same user data\\n  * No request caching implemented\\n  * Missing error boundaries\\n  * Average response time: 340ms"}}',
  },
  {
    content:
      "I found some optimization opportunities:\n\n## API Optimization Strategies\n\n### 1. Implement Request Caching\n```tsx\nimport { useQuery } from '@tanstack/react-query';\n\nfunction useUser(userId) {\n  return useQuery({\n    queryKey: ['user', userId],\n    queryFn: () => fetchUser(userId),\n    staleTime: 5 * 60 * 1000, // 5 minutes\n  });\n}\n```\n\n### 2. Batch Related Requests\n```tsx\n// Instead of 3 separate calls\nconst user = await fetchUser(id);\nconst posts = await fetchPosts(id);\nconst comments = await fetchComments(id);\n\n// Use a single batch endpoint\nconst { user, posts, comments } = await fetchUserData(id);\n```\n\n### 3. Add Loading States\n```tsx\nif (isLoading) return <Spinner />;\nif (error) return <ErrorMessage error={error} />;\nreturn <UserProfile data={data} />;\n```\n\n### 4. Prefetch Critical Data\n```tsx\nqueryClient.prefetchQuery({\n  queryKey: ['user', userId],\n  queryFn: () => fetchUser(userId),\n});\n```\n\nThese changes should reduce API calls by ~60% and improve response times.",
    messageType: 'agent',
    toolInfo: null,
  },
];

export const MOCK_TOOL_APPROVAL_MESSAGE: DuoMessage = {
  content: 'I need to run a shell command to complete this task. Do you approve?',
  messageType: 'request',
  toolInfo: JSON.stringify({
    name: 'run_command',
    args: { command: 'echo hello world && ls -la' },
  }),
};

export const MOCK_AGENT_MESSAGE = {
  content:
    "I found several areas where you can improve performance:\n\n## Key Optimizations\n\n### 1. Memoize Expensive Calculations\n```jsx\nconst sortedProducts = useMemo(() => {\n  return products.sort((a, b) => b.price - a.price);\n}, [products]);\n```\n\n### 2. Prevent Unnecessary Re-renders\n```jsx\nconst MemoizedProduct = React.memo(ProductCard);\n```\n\n### 3. Use Virtual Scrolling for Large Lists\nFor lists with 100+ items, implement virtualization using libraries like `react-window` or `react-virtualized`.\n\n### 4. Code Splitting\n```jsx\nconst Dashboard = lazy(() => import('./Dashboard'));\n```\n\nWould you like me to help implement any of these optimizations?",
  messageType: 'agent',
  toolInfo: null,
};
