# With opencode as implementer, I built a zero-cost AI chatbot

I described a chatbot idea to a coding agent, **opencode**, and the code came back ready. The part worth sharing: this worked because deciding what to build was on me, and turning it into code was on it. The project is a chat that answers using real tools via the Model Context Protocol (MCP), with a **zero** cost requirement.

## A division of roles that worked

- I set the **scope**: weather, search, math and GitHub profile, with a zero-cost constraint.
- I set the **architecture**: a frontend (Next.js) separate from a tool server (MCP), a Groq model, streaming through the Vercel AI SDK.
- opencode **implemented**: it built the modules, the tools, the UI and the dev script (`dev.sh`).
- I **reviewed and validated**: I ran the checks and tuned prompts and descriptions until the behavior matched.

## The brain behind the chat

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

The loop: the user asks, the model picks a tool, the MCP server really executes it, the result goes back to the model, and the answer streams to the browser. The frontend discovers tools at runtime with `tools/list`, so nothing is hardcoded in the client.

One example of what opencode generated, the weather tool definition:

```ts
server.registerTool(
  'get_weather',
  {
    description:
      'Get the current weather for a city. Returns temperature, humidity, wind speed and conditions.',
    inputSchema: z.object({
      city: z.string().min(1).max(80).describe('City name, e.g. "Sao Paulo"'),
    }),
  },
  async ({ city, country }) => {
    return { content: [{ type: 'text', text: await fetchWeather(city, country) }] }
  },
)
```

## Infra, deploy and security

- **Vercel Hobby** for the frontend, **Render free** for the MCP server. $0, both with HTTPS.
- They are **two independent processes**: the tool provider is decoupled from the agent, and the same MCP server could serve other clients.
- Render free **sleeps** after ~15 min of inactivity. The UI polls `/api/health` and shows a cold-start banner with auto-retry, treating it as a feature, not a bug.
- `ALLOWED_HOSTS` guards against DNS rebinding, and the `GROQ_API_KEY` lives only on the server side.

## Takeaways

- **The system prompt works as the spec.** I wrote in `lib/prompts.ts` what the agent may and may not do, and opencode followed it as a guide when generating code.
- **Agent quality lives in the tool `description`s.** Tuning those lines changed behavior more than any other single change.
- **A clear scope speeds up the implementer.** When the architect sets the boundaries (which tools, which cost, which stack), the generated code makes much more sense.
- **Reviewing agent code needs the same bar as human code review**: check schemas, security, error handling and limits (like `isStepCount(8)`, which prevents infinite loops).

The code is at `https://github.com/davi1985/ai-agent-mcp-demo`. If you want to understand how an AI agent works in practice, open it and follow one question from the user down to the tool.

#AgenticAI #MCP #OpenCode #TypeScript #Nextjs #FreeDeploy #AI