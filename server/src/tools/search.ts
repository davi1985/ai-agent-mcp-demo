import type { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

interface SearchHit {
  title: string
  snippet?: string
}

const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const WIKI_USER_AGENT =
  'mcp-agent-demo/1.0 (portfolio project; contact: github)'

export function registerSearchTool(server: McpServer): void {
  server.registerTool(
    'web_search',
    {
      description:
        'Search the web (via Wikipedia) for a query and return the top results with titles, snippets and links. Use this to answer questions about facts, people, technologies or current topics.',
      inputSchema: z.object({
        query: z.string().min(1).max(200).describe('Search query'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe('Number of results (default 3)'),
      }),
    },
    async ({ query, limit }) => {
      const text = await searchWeb(query, limit ?? 3)
      return text.startsWith('ERROR')
        ? { content: [{ type: 'text', text: text.slice(6) }], isError: true }
        : { content: [{ type: 'text', text }] }
    },
  )
}

function formatResult(hit: SearchHit, index: number): string {
  const title = hit.title.replace(/[\s-]+$/g, '').trim()
  const url = `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}`
  const snippet = (hit.snippet ?? '').replace(/<[^>]+>/g, '').trim()
  return `${index}. ${title}\n   ${url}\n   ${snippet}`
}

async function searchWeb(query: string, limit: number): Promise<string> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      format: 'json',
      srlimit: String(limit),
      origin: '*',
    })
    const res = await fetch(`${WIKI_API}?${params}`, {
      headers: { 'User-Agent': WIKI_USER_AGENT },
    })
    if (!res.ok) return `ERROR Search failed (HTTP ${res.status}).`

    const json = (await res.json()) as { query?: { search?: SearchHit[] } }
    const hits = json.query?.search ?? []
    if (hits.length === 0) {
      return `No web results found for "${query}".`
    }

    const lines = hits.map((hit, i) => formatResult(hit, i + 1))
    return [`Top ${hits.length} results for "${query}":`, ...lines].join('\n\n')
  } catch (err) {
    return `ERROR Search request failed: ${(err as Error).message}`
  }
}
