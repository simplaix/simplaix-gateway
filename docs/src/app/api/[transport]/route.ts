import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { source, getLLMText } from '@/lib/source';

const handler = createMcpHandler(
  (server) => {
    // ── list_docs ──────────────────────────────────────────────────────────────
    server.registerTool(
      'list_docs',
      {
        title: 'List Documentation Pages',
        description:
          'List all Simplaix Gateway documentation pages with their titles, URLs, and descriptions. Use this to discover what documentation is available before fetching specific pages.',
        inputSchema: {},
      },
      async () => {
        const pages = source.getPages().map((page) => ({
          title: page.data.title,
          description: page.data.description ?? '',
          url: page.url,
          slug: page.slugs.join('/'),
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(pages, null, 2),
            },
          ],
        };
      },
    );

    // ── get_page ───────────────────────────────────────────────────────────────
    server.registerTool(
      'get_page',
      {
        title: 'Get Documentation Page',
        description:
          'Fetch the full markdown content of a documentation page by its slug. Use list_docs first to find the slug.',
        inputSchema: {
          slug: z
            .string()
            .describe(
              'Page slug, e.g. "getting-started/quick-start" or "guides/app-builder". Use list_docs to find available slugs.',
            ),
        },
      },
      async ({ slug }) => {
        const slugParts = slug.split('/').filter(Boolean);
        const page = source.getPage(slugParts);

        if (!page) {
          return {
            content: [
              {
                type: 'text',
                text: `Page not found: "${slug}". Use list_docs to see available pages.`,
              },
            ],
            isError: true,
          };
        }

        const text = await getLLMText(page);

        return {
          content: [{ type: 'text', text }],
        };
      },
    );

    // ── search_docs ────────────────────────────────────────────────────────────
    server.registerTool(
      'search_docs',
      {
        title: 'Search Documentation',
        description:
          'Search documentation pages by keyword. Searches page titles and descriptions. Returns matching pages with their slugs so you can fetch full content with get_page.',
        inputSchema: {
          query: z.string().describe('Search keywords, e.g. "authentication", "credential vault"'),
        },
      },
      async ({ query }) => {
        const q = query.toLowerCase();
        const matches = source
          .getPages()
          .filter(
            (page) =>
              page.data.title.toLowerCase().includes(q) ||
              (page.data.description ?? '').toLowerCase().includes(q),
          )
          .map((page) => ({
            title: page.data.title,
            description: page.data.description ?? '',
            url: page.url,
            slug: page.slugs.join('/'),
          }));

        if (matches.length === 0) {
          return {
            content: [{ type: 'text', text: `No pages found matching "${query}".` }],
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }],
        };
      },
    );
  },
  {},
  {
    basePath: '/api',
    maxDuration: 60,
  },
);

export { handler as GET, handler as POST };
