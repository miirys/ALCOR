export * from './issue_service';
export * from './merge_request_service';

export type IssuableDiscussionNote = {
  body: string;
  author: {
    username: string;
  };
  createdAt: string;
};

type IssuableDiscussionNoteConnection = {
  notes: {
    nodes: IssuableDiscussionNote[];
  };
};

export interface IssuableDetails {
  title: string;
  description: string | null;
  state: string;
  webUrl: string;
  discussions: {
    nodes: IssuableDiscussionNoteConnection[];
  };
}
