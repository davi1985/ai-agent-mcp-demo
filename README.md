# MCP Agent — Conversational AI Portfolio Demo

A **conversational AI agent** built with **TypeScript and React** that discovers and calls tools at **runtime** through the **Model Context Protocol** (MCP). The user asks questions in natural language (weather, math, GitHub profiles, web search) and the model calls real tools — displayed live in the interface.

Built with a **zero-cost** stack: all services have free tiers and **no credit card** is required.

![Stack](https://img.shields.io/badge/stack-TypeScript%20%2B%20React%20%2B%20Next.js%20%2B%20MCP%20%2B%20AI%20SDK-7c5cff)

> **📚 Full documentation:** this README is a summary. For the complete, didactic guide to the entire implementation — including how to build **your own agent** — see [`docs/pt.md`](./docs/pt.md) (Portuguese) or [`docs/en.md`](./docs/en.md) (English).

---

## Features

| User question | MCP tool the agent calls |
| --- | --- |
| "What's the weather in Tokyo?" | `get_weather` (Open-Meteo, no API key) |
| "Who created Vercel?" | `web_search` (Wikipedia, no API key) |
| "Calculate: (15% of 4,800) + 120" | `calculate` (mathjs sandbox) |
| "Show the GitHub profile of openai" | `get_github_user` (GitHub public API) |

- **Dynamic tools**: the MCP client lists tools from the server each session and converts them into AI SDK tool executors — no tool is "hardcoded" in the frontend.
- **Real-time streaming**: tool call cards appear with a spinner while the model uses the tool, and the final answer streams token by token.
- **Cold-start tolerant**: the MCP server runs on Render's free tier and sleeps when idle; the frontend detects this and shows a "waking up…" banner with auto-retry.
- **$0 cost**: Groq (LLM), Open-Meteo, Wikipedia, GitHub, Vercel Hobby, Render free — no credit card.

---

## How it works

```
Browser (React / Next.js)
      │  POST /api/agent (UIMessage streaming)          │  MCP over Streamable HTTP
      ▼                                                  ▼
┌─────────────────────────────┐   tools/list + tools/call   ┌────────────────────────┐
│     Next.js API route       │ ───────────────────────────▶ │  MCP Server (Express) │
│  Groq LLM  ── streamText ──▶│                             │  • get_weather         │
│       (AI SDK v7)           │                             │  • web_search          │
└─────────────────────────────┘                             │  • calculate           │
                                                            │  • get_github_user     │
                                                            └────────────────────────┘
```

1. User sends a message → the frontend streams it to `POST /api/agent`.
2. The route opens an MCP session, **discovers tools** (`tools/list`), and registers them in the model via AI SDK v7.
3. The model decides which tool to call; the call is executed on the **MCP server** (`tools/call`) and the result is fed back to the model.
4. The answer streams back to the client (AI SDK UIMessage protocol) and the tool call card becomes visible.
5. The MCP session is closed at the end of each request.

---

## Running locally

### Prerequisites
- Node.js 20+ (tested with v24.19.0)
- A **free Groq API key** ([console.groq.com](https://console.groq.com) — no credit card)

### One command (recommended)

```bash
cd ai-agent-mcp-demo
cp web/.env.example web/.env.local   # then paste your GROQ_API_KEY
./dev.sh
```

Opens the MCP server on port **3000** and the frontend on port **3001**.

### Manual start (two terminals)

```bash
# Terminal 1 — MCP server
cd server && yarn && yarn dev         # http://localhost:3000/mcp

# Terminal 2 — Frontend
cd web && yarn && yarn dev            # http://localhost:3001
```

### Groq API key setup

1. Sign up at [console.groq.com](https://console.groq.com) (no credit card).
2. Go to **API Keys** → **Create API Key** (prefix `gsk_`).
3. Copy it into `web/.env.local` as `GROQ_API_KEY=gsk_...`.

The default model is `qwen/qwen3.8-27b`. You can change it via the `MODEL` environment variable.

---

## Deploying (free)

### MCP server → Render (free)

1. Push this repo to GitHub.
2. **Render → New → Web Service**, connect the repo, root directory `server`, build command `yarn && yarn build`, start command `yarn start`.
3. Add environment variable: `ALLOWED_HOSTS=<your-subdomain>.onrender.com`.
4. The free tier sleeps after ~15 min of inactivity — the frontend handles this automatically.

### Frontend → Vercel (Hobby)

1. **Vercel → Add New → Project**, connect the repo, root directory `web`.
2. Add environment variables:
   - `GROQ_API_KEY=...`
   - `MCP_SERVER_URL=https://<your-subdomain>.onrender.com/mcp`
3. **Deploy**. Your chat runs on `*.vercel.app` at zero cost.

> The Groq key lives **server-side only** (environment variable). It is never sent to the browser.

---

## Project structure

```
ai-agent-mcp-demo/
├── server/                     # MCP server (Node + Express + @modelcontextprotocol/server v2)
│   ├── src/
│   │   ├── index.ts            # Express app + /mcp endpoint + /health (DNS-rebinding guard)
│   │   └── tools/
│   │       ├── weather.ts      # Open-Meteo (no API key)
│   │       ├── search.ts       # Wikipedia API (no API key)
│   │       ├── calculate.ts    # mathjs with character sandbox
│   │       └── github.ts       # GitHub public API (no API key)
│   └── package.json
├── web/                        # Frontend (Next.js App Router + AI SDK v7)
│   ├── app/
│   │   ├── page.tsx            # Chat UI page
│   │   └── api/
│   │       ├── agent/route.ts  # LLM + MCP tools + streaming
│   │       └── health/route.ts # cold-start health probe
│   ├── components/
│   │   ├── ChatInterface.tsx   # useChat (DefaultChatTransport)
│   │   ├── ToolCallCard.tsx    # live tool call cards
│   │   └── ServerStatus.tsx    # Render wake-up banner
│   └── lib/
│       ├── mcp.ts              # connectMcp / closeMcp / buildToolSet
│       └── prompts.ts          # system prompt
├── dev.sh                      # starts both server + frontend
├── LICENSE
└── README.md
```

---

## Stack

| Layer | Technology |
| --- | --- |
| LLM | Groq (`qwen/qwen3.8-27b` default) + AI SDK v7 |
| MCP | `@modelcontextprotocol/server` · `client` · `express` (v2, Streamable HTTP) |
| Frontend | Next.js 16 · React 19 · TypeScript 5.9 |
| MCP server | Express 5 · zod 4 · mathjs |
| Deploy | Vercel Hobby (frontend) · Render free (MCP server) |

---

## License

MIT — see [LICENSE](./LICENSE).