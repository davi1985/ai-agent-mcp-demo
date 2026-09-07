import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { jsonSchema, type ToolSet } from 'ai'

const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:3000/mcp'

/**
 * Opens an MCP client session against the MCP server.
 * Throws if the server is unreachable (e.g. Render free tier cold start).
 */
export async function connectMcp(): Promise<Client> {
  const client = new Client({ name: 'mcp-agent-web', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL))
  await client.connect(transport)
  return client
}

/** Closes the MCP session, best-effort. */
export async function closeMcp(client: Client): Promise<void> {
  try {
    const transport = client.transport as { terminateSession?(): Promise<void> }
    if (typeof transport.terminateSession === 'function') {
      await transport.terminateSession().catch(() => {})
    }
  } catch {
    /* ignore */
  }
  await client.close().catch(() => {})
}

/**
 * Lists every tool exposed by the MCP server and converts it into an
 * AI SDK ToolSet so the language model can call them at runtime.
 */
export async function buildToolSet(client: Client): Promise<ToolSet> {
  const { tools } = await client.listTools()

  const entries = tools.map((mcpTool) => {
    const schema = mcpTool.inputSchema as unknown as Parameters<
      typeof jsonSchema
    >[0]
    return [
      mcpTool.name,
      {
        description:
          mcpTool.description ??
          `Invoke the ${mcpTool.name} tool exposed by the MCP server.`,
        inputSchema: jsonSchema(schema),
        execute: async (args: unknown) => {
          const result = await client.callTool({
            name: mcpTool.name,
            arguments: (args ?? {}) as Record<string, unknown>,
          })
          const text = result.content
            .filter((block) => block.type === 'text')
            .map((block) => (block as { text: string }).text)
            .join('\n')
          if (result.isError) {
            throw new Error(text || `Tool ${mcpTool.name} failed.`)
          }
          return text
        },
      },
    ] as const
  })

  return Object.fromEntries(entries)
}
