import { Readable } from 'stream';
import fp from 'fastify-plugin';

export interface HtmlTransformerPluginOptions {
  transformHtml: (html: string) => string | Promise<string>;
}

async function readStream(stream: Readable) {
  return new Promise<string>((resolve, reject) => {
    let data = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      data += chunk;
    });

    stream.on('end', () => {
      resolve(data);
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

export const htmlTransformerPlugin = fp<HtmlTransformerPluginOptions>(
  async (fastify, { transformHtml }) => {
    fastify.addHook('onSend', async (request, reply, payload) => {
      // Only process HTML content
      const contentType = reply.getHeader('content-type');
      if (!contentType || typeof contentType === 'number' || !contentType.includes('text/html')) {
        return payload;
      }

      // Transform string payloads
      if (typeof payload === 'string') {
        try {
          return await transformHtml(payload);
        } catch (error) {
          fastify.log.error({ error, url: request.url }, 'String HTML transformation failed');
          return payload;
        }
      }

      // Transform buffer payloads
      if (Buffer.isBuffer(payload)) {
        try {
          const html = payload.toString('utf-8');
          const transformed = await transformHtml(html);
          return Buffer.from(transformed, 'utf-8');
        } catch (error) {
          fastify.log.error({ error, url: request.url }, 'Buffer HTML transformation failed');
          return payload;
        }
      }

      // Handle stream
      if (payload instanceof Readable) {
        try {
          const html = await readStream(payload);
          const transformed = await transformHtml(html);
          return Buffer.from(transformed, 'utf-8');
        } catch (error) {
          fastify.log.error({ error, url: request.url }, 'Stream HTML transformation failed');
          return payload;
        }
      }

      // For streams or other payload types, don't transform
      return payload;
    });
  },
  {
    encapsulate: false,
    name: 'html-transformer-plugin',
  },
);
