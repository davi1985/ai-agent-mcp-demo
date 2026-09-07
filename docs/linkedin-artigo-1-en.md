# How I built an AI chat that calls real tools (MCP in practice)

I wanted a chatbot that answered about the weather, looked up facts, solved math and fetched a GitHub profile, all in plain language. And it had to cost **zero dollars**. No credit card. That became the `ai-agent-mcp-demo` project, and it is the simplest real case I know for understanding the Model Context Protocol (MCP).

## The idea in one sentence

The model (Groq) does not hold Tokyo's weather or GitHub repositories in its head. It gets access to **tools** and, for each question, decides which one to call and with what arguments. The tool is what answers "it is X degrees in Tokyo today; the LLM just turns the result into a sentence.

The whole flow runs on the Vercel AI SDK v7. On the server side, four tools are exposed through MCP: `get_weather` (Open-Meteo), `web_search` (Wikipedia), `calculate` (mathjs) and `get_github_user` (GitHub public API). None of them needs an API key.

## How the application works

```
Browser (React / Next.js)
      │  POST /api/agent
      ▼
Next.js + AI SDK v7 (streamText)      MCP server (Express)
      │   tools/list  ◄──────────────  • get_weather
      │   tools/call  ──────────────►  • web_search
      ▼                                • calculate
Browser ◄────── stream ◄────────────  • get_github_user
```

The detail that changes everything: the frontend **has no tools hardcoded**. `buildToolSet` asks the server what it exposes and builds the executors on the fly:

```ts
const entries = tools.map((mcpTool) => [
  mcpTool.name,
  {
    description: mcpTool.description,
    inputSchema: jsonSchema(mcpTool.inputSchema),
    execute: (args) => client.callTool({ name: mcpTool.name, arguments: args }),
  },
])
return Object.fromEntries(entries)
```

The agent itself is just a `streamText` with those tools: the model emits a tool call, the result comes back, and the final answer streams to the browser.

```ts
const result = streamText({
  model: groq(MODEL),
  system: SYSTEM_PROMPT,
  messages,
  tools,
  stopWhen: isStepCount(8),
})
```

## Infra and deploy (all free)

- **Frontend** on **Vercel Hobby**: Next.js, HTTPS, deploys from git, $0.
- **MCP server** on **Render free**: a plain Node process, but it sleeps after ~15 min of inactivity.
- That sleep is the well-known **cold start**. The UI detects it through `GET /api/health` (a proxy that just polls the server) and shows a "waking up" banner with auto-retry, instead of looking broken.
- The two services are separate processes. That decouples the tool provider from the agent; the same MCP server could serve other clients.
- Security: `ALLOWED_HOSTS` blocks DNS rebinding, the `GROQ_API_KEY` lives only on the server (env var, never in the browser) and Zod validates every tool argument.

## What I learned

1. **The tool description is what defines agent quality.** The LLM decides from the `description` text; a good one is worth more than tuning the system prompt.
2. **Zod saves you from creative models.** Without a schema, the model invents arguments. With a `z.object(...)` inside `registerTool`, a bad argument never even runs.
3. **Step limits prevent infinite loops.** `isStepCount(8)` costs little and stops the conversation before it becomes an expensive snowball.
4. **Zero cost is a design decision, not a detail.** It steered every choice: Groq instead of a paid provider, Open-Meteo and Wikipedia instead of keyed APIs, Vercel + Render free instead of paid cloud.

To explore it, the code is at `https://github.com/davi1985/ai-agent-mcp-demo`, with full docs (English and pt-BR). And if you already code with a coding assistant (Claude Code, opencode and similar), the same notions of "agent", "tool" and "prompt" you see daily are exactly the ones built from scratch here.

#AI #MCP #AgenticAI #TypeScript #Nextjs #Vercel #LinkedInTech