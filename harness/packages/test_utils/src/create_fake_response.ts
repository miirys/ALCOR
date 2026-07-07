import { createFakePartial } from './create_fake_partial';

interface FakeResponseOptions {
  status?: number;
  text?: string;
  json?: unknown;
  url?: string;
  headers?: Record<string, string>;
}

export const createFakeResponse = ({
  status = 200,
  text = '',
  json = {},
  url = '',
  headers = {},
}: FakeResponseOptions): Response => {
  return createFakePartial<Response>({
    ok: status >= 200 && status < 400,
    status,
    url,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(json),
    headers: new Headers(headers),
    body: new ReadableStream({
      start(controller) {
        // Add text (as Uint8Array) to the stream
        controller.enqueue(new TextEncoder().encode(text));
      },
    }),
  });
};
