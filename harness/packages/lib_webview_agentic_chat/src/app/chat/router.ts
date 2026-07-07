import NestedRouteView from '../routes/nested_route_view.vue';
import AgenticChat from './common/chat.vue';
import ChatHistory from './common/chat_history.vue';
import { CHATS_INDEX, CHATS_NEW, CHATS_SHOW } from './routes/constants';

export const CHAT_ROUTES = [
  {
    path: '/chats',
    component: NestedRouteView,
    children: [
      {
        name: CHATS_INDEX,
        path: '',
        component: ChatHistory,
        props: {
          enableSearch: true,
        },
      },
      {
        name: CHATS_NEW,
        path: 'new',
        component: AgenticChat,
      },
      {
        name: CHATS_SHOW,
        path: ':workflowId(\\d+)',
        component: AgenticChat,
      },
    ],
  },
];
