import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpExpressApp } from '@modelcontextprotocol/express'
import { registerWeatherTool } from './tools/weather.js'
import { registerSearchTool } from './tools/search.js'
import { registerCalculateTool } from './tools/calculate.js'
import { registerGithubTool } from './tools/github.js'

const SERVER_NAME = process.env.MCP_SERVER_NAME ?? 'mcp-agent/demo'
const VERSION = '1.0.0'
const PORT = Number(process.env.PORT ?? 3000)
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS ?? 'localhost,127.0.0.1')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean)

function buildServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: VERSION })
  registerWeatherTool(server)
  registerSearchTool(server)
  registerCalculateTool(server)
  registerGithubTool(server)
  return server
}

const handler = createMcpHandler(buildServer)

const app = createMcpExpressApp({
  host: '0.0.0.0',
  allowedHosts: ALLOWED_HOSTS,
})

app.get('/', (_req, res) => {
  res.json({
    name: SERVER_NAME,
    version: VERSION,
    tools: ['get_weather', 'web_search', 'calculate', 'get_github_user'],
    health: `${reqHostBase(res)}/health`,
    spec: 'https://modelcontextprotocol.io',
  })
})

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    name: SERVER_NAME,
    version: VERSION,
    tools: ['get_weather', 'web_search', 'calculate', 'get_github_user'],
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  })
})

const node = toNodeHandler(handler)
app.all('/mcp', (req, res) => void node(req, res, req.body))

app.listen(PORT, '0.0.0.0', () => {
  console.error(
    `[mcp-agent-server] ${SERVER_NAME} listening on http://0.0.0.0:${PORT}/mcp`,
  )
})

function reqHostBase(_res: object): string {
  const host = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`
  return host.replace(/\/$/, '')
}

process.on('SIGINT', async () => {
  await handler.close()
  process.exit(0)
})
