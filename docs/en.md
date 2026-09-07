# Full Documentation — `ai-agent-mcp-demo` Project

A complete, didactic guide to how this project works, written for a developer who wants to **understand 100%** of the implementation and, from here, build **their own AI agent**.

> If you use **Claude Code** as your day-to-day work tool (planning features, fixing bugs), this document bridges the gap: it uses the same family of concepts ("agent", "tools", "prompts") you already see daily, but now explains how they are **built from scratch in code**.

---

## Table of Contents

1. [What this project is (in one sentence and in more detail)](#1-what-this-project-is)
2. [Fundamental concepts (read before anything else)](#2-fundamental-concepts)
3. [Overall architecture — bird's eye view](#3-overall-architecture)
4. [Message flow, step by step](#4-message-flow)
5. [The MCP Server (`server/`)](#5-the-mcp-server)
   - [index.ts — entry point and endpoints](#51-indexts)
   - [How tools are registered](#52-how-tools-are-registered)
   - [Each tool in detail](#53-each-tool-in-detail)
6. [The Web Frontend (`web/`)](#6-the-web-frontend)
   - [MCP client layer (`lib/mcp.ts`)](#61-libmcp--how-the-client-talks-to-the-server)
   - [System prompts (`lib/prompts.ts`)](#62-libpromptsts)
   - [The agent API (`app/api/agent/route.ts`) — the "brain"](#63-the-agent-api)
   - [The health check API](#64-the-health-check-api)
   - [React components](#65-react-components)
7. [Configuration and environment variables](#7-configuration-and-environment-variables)
8. [How to run, develop and debug](#8-how-to-run-develop-and-debug)
9. [How to deploy for free](#9-how-to-deploy-for-free)
10. [Design decisions and why](#10-design-decisions-and-whys)
11. [Security and best practices](#11-security-and-best-practices)
12. [How to build YOUR OWN agent — step by step](#12-how-to-build-your-own-agent)
13. [Glossary](#13-glossary)

---

## 1. What this project is

**In one sentence:** it's a **chat** where the user asks questions in natural language (weather, math, GitHub profile, web search) and an **AI model** responds by **calling real tools in real time**, whose results appear live in the interface.

**In more detail:** the AI doesn't have weather knowledge or GitHub repositories "in its head." It has access to **tools** (functions that fetch real data) and, for each question, decides **which tool to call and with which arguments**. This is the heart of an **agent**: a model that **acts** (calls functions), not just **talks** (generates text).

The project was built with a strong requirement: **zero cost** (all services have free tiers, no credit card). This influenced every technology choice.

---

## 2. Fundamental concepts

For a developer new to agents, these are the concepts that unlock the whole code reading:

### 2.1 Language model (LLM)
The "brain" that understands and generates text. It has **no access to real-world data** by itself — it only converses. In this project it's **Groq** (`qwen/qwen3.8-27b`).

### 2.2 Tool
A function with a **name, description, and an input schema**. The model reads these descriptions and "decides" to call the tool when it deems necessary. E.g.: `get_weather(city)`.

### 2.3 Tool calling
The mechanism by which the LLM, during response generation, emits a structured call like `{ tool: "get_weather", args: { city: "Tokyo" } }`. The code executes the real function, gets the result, and hands it back to the model, which then writes the final answer **based on** that result.

### 2.4 MCP — Model Context Protocol
It's the **protocol** (an open standard, from Anthropic — the creators of Claude) that standardizes how an agent **discovers and calls tools** provided by an **external server**. It's like a "tool USB": an MCP server exposes tools; any MCP client can use them.

The big MCP advantage here: **the tools are not hardcoded in the frontend**. The client asks the server for the list of tools at runtime (`tools/list`) and builds executors on top of it. If tomorrow you add a new tool to the server, the frontend uses it automatically, without touching the frontend.

### 2.5 AI SDK (Vercel)
A library (from Vercel) that unifies access to many LLM providers (OpenAI, Anthropic, Groq, etc.) with a common API. Here we use:
- **`ai`** — the core (the `streamText` function for streaming generation with tool calling).
- **`@ai-sdk/react`** — the `useChat` hook for the UI.
- **`@ai-sdk/openai-compatible`** — adapter for services compatible with the OpenAI API (which Groq is).

### 2.6 Streaming
Instead of waiting for the entire response, the server sends the "chunks" as soon as they're generated. This gives a real-time typing feel and, during tool calls, allows showing spinners.

### 2.7 Streamable HTTP transport
The way two processes talk MCP over the network using HTTP (+ streaming via SSE/event stream). The server exposes the `/mcp` endpoint; the client connects to it.

---

## 3. Overall architecture

The project has **two independent applications** + a script that runs them together:

```
┌────────────────────────────────────────────┐        ┌──────────────────────────────────────┐
│           FRONTEND  (web/ — Next.js)       │        │           SERVER (server/)           │
│                                            │  HTTP  │                                      │
│  Browser ←→ Next.js App Router             │ ──────▶ │  Express 5  +  MCP  (@modelcontext) │
│       │                                    │  /mcp   │       │                             │
│       │ useChat (@ai-sdk/react)            │         │       ├─ get_weather  (Open-Meteo)   │
│       ▼                                    │         │       ├─ web_search   (Wikipedia)    │
│  POST /api/agent  — the "brain"            │         │       ├─ calculate    (mathjs)       │
│   · connects to the MCP server             │         │       └─ get_github_user (GitHub)    │
│   · discovers the tools                    │         │                                      │
│   · calls the LLM with tool calling        │         │       GET /      → info               │
│   · streams the response                   │         │       GET /health → status            │
│                                            │         │                                      │
│  GET /api/health — probes the MCP server   │         │                                      │
└────────────────────────────────────────────┘        └──────────────────────────────────────┘
```

**Roles:**
- **`server/`** — the "tool vault." A Node process that knows how to do the 4 real things (weather, search, calculation, GitHub) and exposes them through the MCP protocol.
- **`web/`** — the agent's "face." Chat interface that connects the user to the model and the tools.
- **`dev.sh`** — orchestrates both locally.

---

## 4. Message flow

Let's follow a real question, like *"What's the weather in Tokyo?"*:

1. **The user types** in the browser input field.
2. The `useChat` hook (frontend) sends the question to `POST /api/agent`.
3. The agent API does **`connectMcp()`** → opens an MCP session against the server (`http://localhost:3000/mcp`).
4. Calls **`buildToolSet()`** → asks the server for `tools/list`, which returns the 4 tools with name, description and schema; the code converts each into an AI SDK-compatible executor.
5. Calls **`streamText()`** with: the Groq model, the **system prompt**, the message history, and the tool set.
6. The LLM "thinks": *the person wants the weather, I have the `get_weather` tool*. It emits a **tool call**: `get_weather(city: "Tokyo")`.
7. The AI SDK executes the tool executor → which calls `client.callTool()` on the MCP server → which fetches the weather from Open-Meteo → returns the formatted text.
8. The **result is fed back to the LLM**, which now writes the final answer ("In Tokyo it's 24°C...") based on it.
9. The answer is **streamed** back to the browser; in the UI, the tool call card appears with a spinner and then with the result.
10. When done, the MCP session is **closed** (`closeMcp`).

This "model decides → runs tool → returns result → model responds" cycle can repeat several times (here, up to 8 steps, controlled by `isStepCount(8)`).

---

## 5. The MCP Server

### 5.1 `index.ts`

Location: `server/src/index.ts`.

This is the server's entry point. It does, in order:

1. **Reads environment configuration**: `MCP_SERVER_NAME` (exposed name), `PORT` (default 3000), `ALLOWED_HOSTS`.

2. **`buildServer()`** — creates the `McpServer` instance (from `@modelcontextprotocol/server`) and **registers the 4 tools**. This is the heart of extensibility: to add a tool, just create a `registerXxxTool(server)` and call it here.

3. **`createMcpHandler(buildServer)`** — creates the handler that processes MCP protocol requests (list tools, call tools).

4. **`createMcpExpressApp(...)`** — sets up the Express layer that exposes MCP. Note two important details:
   - `host: '0.0.0.0'` — listens on all network interfaces (essential for the server to be reachable from outside, not just `localhost`).
   - `allowedHosts: ALLOWED_HOSTS` — protection against **DNS rebinding** (see [Section 11](#11-security-and-best-practices)).

5. **Helper HTTP routes**:
   - `GET /` → returns a JSON with name, version, tool list, health URL and link to the MCP spec.
   - `GET /health` → returns `{ status, name, version, tools, uptime, timestamp }`. This is what the frontend queries to know if the server is up.

6. **`app.all('/mcp', ...)`** — the **main MCP route**. All HTTP verbs pass through here; `toNodeHandler` translates each HTTP request into an MCP protocol operation (list/call tools). This is where the protocol "lives".

7. **`app.listen(PORT, ...)`** — starts the server and logs the endpoint.

8. **`SIGINT` handler** — gracefully closes the MCP handler session when the process receives Ctrl+C.

**Note on `reqHostBase`:** a function that builds the public base URL (uses `PUBLIC_URL` if set, otherwise `http://localhost:PORT`). It's only used to build the health link on `GET /`.

### 5.2 How tools are registered

Each tool is a module that exports a `registerXxxTool(server)` function. Inside it we call:

```ts
server.registerTool(
  'tool_name',                   // unique name the model will use
  {
    description: '...',           // description the LLM reads to decide when to use it
    inputSchema: z.object({ ... }), // input schema (validates arguments)
  },
  async (args) => { ... },        // executor: does the real action and returns text
)
```

Three important points about this pattern:

- **The `description` is the "LLM manual".** The better it indicates *when to use it*, the better the model decides. The code is careful here (e.g., "Use this whenever the user asks about the weather").
- **The `inputSchema` (Zod)** validates the arguments the model sends. Zod also lets the AI SDK and MCP know the exact shape of the data.
- **The executor returns formatted text** instead of raw JSON, because readable text is easier for the model to incorporate into the final answer.

A consistent pattern across all tools for **errors**: if the internal function returns a string beginning with `"ERROR"`, the executor converts it into an **MCP error result** (`isError: true`), removing the prefix. This lets the error be handled and formatted without breaking the protocol.

### 5.3 Each tool in detail

#### 5.3.1 `get_weather` (`server/src/tools/weather.ts`)

- **Use case:** "What's the weather in São Paulo?" / "Is it cold in Rio?"
- **Input:** `city` (required, 1–80 chars) and `country` (optional, to disambiguate same-name cities).
- **How it works internally:**
  1. **Geocoding** on Open-Meteo (`GEOCODING_URL`): turns the city name into **latitude/longitude**.
  2. Does **accent normalization** (removes accents via `normalize('NFD')`) to match names written differently.
  3. Translates country names **in Portuguese** (e.g., "brasil" → "brazil") to match what the API returns.
  4. Fetches the forecast (`FORECAST_URL`) with a fallback to `wttr.in` if Open-Meteo fails (`fetchForecast` tries one, then the other).
  5. Uses a `WEATHER_CODES` dictionary to turn the numeric weather code into readable text (e.g., `0` → "Clear sky").
  6. Builds a formatted response with condition, temperature (and feels-like), humidity and wind.

- **External free services:** Open-Meteo (geocoding + forecast) and wttr.in (fallback). None requires an API key.

#### 5.3.2 `web_search` (`server/src/tools/search.ts`)

- **Use case:** "Who created Vercel?" / facts, people, technologies.
- **Input:** `query` (1–200 chars) and optional `limit` (1–5, default 3).
- **How it works:** calls the **MediaWiki API** (Wikipedia) with `action=query&list=search`. Formats results with title, URL (`https://en.wikipedia.org/wiki/Name`) and snippet (removing HTML tags).
- **Honest limitation:** it's not "Google". It's a Wikipedia search. Enough for the demo and free.

#### 5.3.3 `calculate` (`server/src/tools/calculate.ts`)

- **Use case:** "What is (15% of 4,800) + 120?"
- **Input:** `expression` (1–200 chars).
- **How it works:** uses **`mathjs`** to evaluate the expression, but with **a security layer**: an `ALLOWED_CHARS` regex only allows digits, operators `+-*/^()` `%`, spaces, comma/dot and lowercase letters. Anything outside is rejected **before** evaluating — this prevents code/malicious expression injection. It also validates that the result is a finite number.
- **Formatting:** integers become plain strings; decimals are rounded to 6 places.

#### 5.3.4 `get_github_user` (`server/src/tools/github.ts`)

- **Use case:** "Show the openai GitHub profile".
- **Input:** `username` (1–39 chars).
- **How it works:** calls the **public GitHub API** (`api.github.com/users/:username`) for the profile, then `/repos?sort=updated&per_page=5` for the 5 most recently updated repos. The generic `fetchJson<T>` function handles the 404 case (user not found) and rate limiting. Formats name, bio, location, company, blog, counters (repos/followers/following) and repos (name, stars, language, description).

---

## 6. The Web Frontend

### 6.1 `lib/mcp.ts` — how the client talks to the server

This file is the **MCP client layer**. It has 3 functions:

- **`connectMcp()`** — instantiates the MCP `Client` (`@modelcontextprotocol/client`), creates a `StreamableHTTPClientTransport` pointing to `MCP_SERVER_URL` (default `http://localhost:3000/mcp`) and connects. Throws an error if the server is unreachable (e.g., Render cold start).
- **`closeMcp()`** — closes the session. First tries `terminateSession()` (a transport-specific function) then `client.close()`, both with silent `catch` (best-effort).
- **`buildToolSet(client)`** — the key piece of "dynamic discovery":
  1. Calls `client.listTools()`, which returns the server's MCP tools.
  2. For each tool, builds an **AI SDK ToolSet** entry with:
     - `description` (the MCP one, or a fallback);
     - `inputSchema: jsonSchema(schema)` — converts the MCP schema (JSON Schema) into the format the AI SDK understands;
     - `execute(args)` — calls `client.callTool()` on the MCP server, extracts text from the content blocks and, if `isError`, returns an error result.
  3. Joins everything into a `ToolSet` object with `Object.fromEntries`.

It's thanks to this function that the frontend **has no tools hardcoded**: it discovers them on every request. This is the essence of MCP in the project.

### 6.2 `lib/prompts.ts`

Contains the **`SYSTEM_PROMPT`**, the agent's "instruction manual", sent to the LLM on every conversation. It says:

- the agent's role (answering using live tools);
- **which tools exist** and what they're for;
- **behavior rules**: prefer tools over guessing, call each tool at most once per step, never invent names/cities/numbers/facts, say when something isn't found, respond in the user's language, and keep answers **short (under 150 words, no markdown/emoji)**.

This prompt most shapes the agent's "behavior" — editing it is the fastest way to change the bot's personality/rules.

### 6.3 The agent API — `app/api/agent/route.ts`

This is the agent's "brain". It's a **POST** route in the Next.js App Router. Let's see what each part does:

- **Route metadata (`runtime`, `dynamic`, `maxDuration`):** forces the Node.js runtime, guarantees it's rendered on every request (not cached), and limits execution to 60s.

- **Reading the environment:** `GROQ_API_KEY` and `MODEL` (default `qwen/qwen3.8-27b`).

- **`createOpenAICompatible(...)`:** creates the LLM provider pointing at the Groq API (`https://api.groq.com/openai/v1`), because Groq is OpenAI-API compatible.

- **Input validation:** expects a body `{ messages: UIMessage[] }` and rejects with 400 if there's no user message.

- **MCP connection:** `await connectMcp()`. If it fails, responds **503** with a friendly message about the Render cold start. (This is the error handling the UI converts into a useful hint.)

- **Assembly and streaming:**
  ```ts
  const tools = await buildToolSet(client)
  const result = streamText({ model, system, messages, tools, ... })
  ```
  - `streamText` generates the response in streaming, with tool calling support.
  - `convertToModelMessages(...)` translates UI messages into the model format (filtering out `reasoning` parts).
  - `stopWhen: isStepCount(8)` — limits the agent to **8 tool call steps** maximum (avoids infinite loops).
  - `onFinish: () => closeMcp(client)` — closes the MCP session at the end.
  - `createUIMessageStreamResponse({ stream: toUIMessageStream(...) })` — converts the model stream into the **UI message protocol** of the AI SDK, consumed by `useChat` in the browser.

- **Error handling:** closes MCP and responds 500 with the error message.

### 6.4 The health check API — `app/api/health/route.ts`

It's a **health proxy**: the browser calls `/api/health` (on the frontend itself), and this route queries `/health` on the MCP server. Reasons to have a proxy instead of calling MCP directly from the browser:
1. The browser **should not** speak MCP/HTTP directly to the internal server (nor expose `MCP_SERVER_URL` in the client in a sensitive way);
2. Centralizes the logic of waiting for the cold start.

It:
- Builds the health URL from `MCP_SERVER_URL` (`new URL('health', ...)`).
- Uses `AbortController` with an **8s timeout** (if the server doesn't respond within that, it assumes "waking"/cold start).
- Returns `status: 'ok'` if it responded, or `status: 'waking'` with details otherwise.

### 6.5 React components

#### 6.5.1 `ChatInterface.tsx` — the chat screen
- Uses the **`useChat`** hook from `@ai-sdk/react` with `DefaultChatTransport({ api: '/api/agent' })`. `DefaultChatTransport` manages communication (POST + stream) with the agent route, including serializing the tool call parts.
- **Starter buttons (`STARTERS`)**: 4 example cards (weather, search, math, GitHub) that fill the question and trigger the call.
- **Part rendering**: a `renderPart` function handles `UIMessage` content types:
  - `text` → bubble paragraph;
  - `step-start` → visual divider between tool call steps;
  - `dynamic-tool` / `tool-*` → tool call card (`ToolCallCard`);
  - `reasoning` → reasoning text (italic, styled).
- **Streaming state**: disables the input and shows the "■ Stop" button while `status` is `submitted`/`streaming`. `stop()` cancels the generation.
- **Friendly error handling**: shows a specific hint depending on the error (Groq rate limit vs. Render cold start).

#### 6.5.2 `ToolCallCard.tsx` — tool call visualization
Shows each tool invocation in a card:
- **Maps names** to readable labels (`get_weather` → "Weather", etc.).
- **Visual states**: purple-bordered spinner while pending; ✓ green when done; red when error.
- Shows the **arguments** (`city=Tokyo`) in the header line.
- Shows the **output** in a monospace `<pre>` block (collapsible by max-height with scroll).

#### 6.5.3 `ServerStatus.tsx` — server status banner
- **Polls** `/api/health` every 5s while the server isn't ready.
- Three states: `checking` (pulsing circle), `ok` (green), `waking` (purple pulse + "Render free tier cold start ~30–60s" explanation + "Retry now" button).
- Uses `useEffect` with a `cancelled` flag and `clearTimeout` in cleanup to avoid memory leaks.

---

## 7. Configuration and environment variables

### Server (`server/.env.example`)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | MCP server port (Render sets it automatically). |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Allowed hosts (DNS rebinding protection). |

(Optional in code, not in `.env.example`: `MCP_SERVER_NAME` and `PUBLIC_URL`.)

### Frontend (`web/.env.example`)

| Variable | Default | Description |
| --- | --- | --- |
| `GROQ_API_KEY` | — | Groq API key (required; `gsk_` prefix). |
| `MCP_SERVER_URL` | `http://localhost:3000/mcp` | MCP server endpoint. |
| `MODEL` | `qwen/qwen3.8-27b` | Model used by Groq. |

> **Important:** the `GROQ_API_KEY` lives **only on the server** (a Next.js environment variable). It's never exposed to the browser — a security best practice (see [Section 11](#11-security-and-best-practices)).

---

## 8. How to run, develop and debug

### Prerequisites
- **Node.js 20+** (tested with v24.19.0).
- Free Groq key at [console.groq.com](https://console.groq.com).

### Quick (recommended)
```bash
cp web/.env.example web/.env.local   # then paste your GROQ_API_KEY
./dev.sh
```
This starts the MCP server on **3000** and the frontend on **3001**, and kills both with Ctrl+C.

### Manual (two terminals)
```bash
# Terminal 1 — MCP server
cd server && yarn && yarn dev        # http://localhost:3000/mcp

# Terminal 2 — Frontend
cd web && yarn && yarn dev           # http://localhost:3001
```

### Useful scripts
- `server`: `yarn dev` (tsx watch, reloads on save), `yarn build` (tsc → `dist/`), `yarn start` (runs the build), `yarn typecheck`.
- `web`: `yarn dev`, `yarn build`, `yarn start`, `yarn typecheck`.

### Debugging
- **Test the MCP server alone**: open `http://localhost:3000/` (info) and `http://localhost:3000/health`. You can also use an MCP client (e.g., MCP Inspector extension) at `http://localhost:3000/mcp`.
- **Server logs**: the `console.error` in `listen` appears in the `server` terminal.
- **Test the agent API**: `curl http://localhost:3001/api/health` for health.
- **See tool calls**: in the UI, the `ToolCallCard`s show arguments and outputs — the best way to see what the model decided.

---

## 9. How to deploy for free

### MCP server → Render (free)
1. Push the repo to GitHub.
2. **Render → New → Web Service**, connect the repo, **root directory** `server`, build `yarn && yarn build`, start `yarn start`.
3. Add the `ALLOWED_HOSTS=<your-subdomain>.onrender.com` env var.
4. The free tier "sleeps" after ~15 min of inactivity — the frontend handles the wake-up automatically.

### Frontend → Vercel (Hobby, free)
1. **Vercel → Add New → Project**, connect the repo, **root directory** `web`.
2. Envs: `GROQ_API_KEY`, `MCP_SERVER_URL=https://<your-subdomain>.onrender.com/mcp`.
3. Deploy.

> The "cold start" concept appears because Render free sleeps; the frontend was designed to detect and wait for it (ServerStatus + 503 on the agent API).

---

## 10. Design decisions and whys

| Decision | Why |
| --- | --- |
| **MCP for the tools** | Standardizes tool discovery/calling; frontend has no hardcoded tools; extensible without touching the client. |
| **Two separate processes** (`server/` + `web/`) | Decouples the "tool provider" from the "agent". The same MCP server can serve several clients/agents. |
| **Groq + `openai-compatible`** | Fast and **free** model, and Groq exposes an OpenAI-compatible API — the AI SDK already has a ready adapter. |
| **AI SDK v7 (`streamText`)** | Abstracts providers and handles tool calling + streaming with a single API. |
| **Rich tool descriptions** | The LLM decides by the description; good descriptions = good decisions. That's the agent's "quality". |
| **Zod for schemas** | Safe input validation and clear declaration of shape, also converted into the JSON Schema consumed by MCP/AI SDK. |
| **`isStepCount(8)`** | Limits tool call steps to avoid costly infinite loops. |
| **Tool responses as formatted text** | Readable text is easier for the model to incorporate into the final answer than raw JSON. |
| **`ALLOWED_HOSTS` mitigates DNS rebinding** | The Render free exposes the server on the public internet; DNS rebinding is a relevant attack class there. |
| **Explicit cold-start handling** | Render free sleeps; without this handling, the first interaction would seem "broken". |
| **Server-side `GROQ_API_KEY`** | The key never goes to the browser, reducing the chance of leaks. |
| **`web_search` via Wikipedia** | Free, no-API-key alternative; a quality trade-off in exchange for zero cost. |

---

## 11. Security and best practices

1. **Never commit secrets.** Note that `web/.env.local` **contains a real Groq key** — it's in `.gitignore`, but it's worth **rotating** (generate a new one in the Groq console) since it was shown. Only commit `.env.example`.
2. **Secrets only on the server.** The `GROQ_API_KEY` is read via `process.env` in the Next.js code (server-side) and is **not** used on the client. Don't expose keys via `NEXT_PUBLIC_*` variables.
3. **Input validation.** Zod validates every tool's arguments; `calculate` also applies a regex whitelist to prevent code injection into `mathjs`.
4. **DNS rebinding protection.** `ALLOWED_HOSTS` restricts which `Host` headers the server accepts. When publishing, update it to include your real domain.
5. **LLM rate limiting.** Groq free has a token/min limit. The frontend already shows a hint when this happens; in a production app you could add queues/retry and per-user limits.
6. **Execution limits.** `maxDuration` (route), `maxOutputTokens` (1024) and `isStepCount(8)` avoid unexpected costs/failures.
7. **HTTPS in production.** Both Render and Vercel provide HTTPS; the production `MCP_SERVER_URL` must use `https`.

---

## 12. How to build YOUR OWN agent — step by step

This is the practical roadmap to build something of your own from this model.

### Step 0 — Decide the scope
Ask yourself: **what real tasks will your agent do?** (query the database? call an API? calculate? schedule?). Each task becomes a **tool**.

### Step 1 — Set up the base (clone/copy the structure)
Copy the `server/` and `web/` folder structure. Install dependencies with `yarn`.

### Step 2 — Add your tools on the server
1. Create `server/src/tools/myTool.ts`.
2. Write the function that does the real action (e.g., `fetchUser()` calling a database or external API).
3. Register with `server.registerTool('my_tool', { description, inputSchema }, handler)`.
4. Import and call the `register` in `buildServer()` in `index.ts`.

**Golden rule:** write the `description` as if instructing someone how to use it — "Use this when the user asks about X". This defines your agent's accuracy. Define the `inputSchema` with Zod using `min`/`max`/`.describe()` for clarity.

### Step 3 — (Optional) New tools appear by themselves
Since the frontend discovers tools via `tools/list`, **your new tools already work in the chat without touching the frontend** (the `ToolCallCard` will show the raw name if it's not in the label map — add it there for a nice label).

### Step 4 — Tweak the system prompt
In `web/lib/prompts.ts`, list your tools and define your agent's rules (language, format, limits, personality).

### Step 5 — Test
Run `./dev.sh`, use the starters / converse, and observe the `ToolCallCard`s to see which tools the model chose and with which arguments. Adjust the `description`s based on observed behavior — **prompt + descriptions are the agent's "tuning"**.

### Step 6 — Change the model (optional)
Change `MODEL` in `.env.local`, or switch providers by editing `createOpenAICompatible`/adapter in `web/app/api/agent/route.ts` (the AI SDK supports OpenAI, Anthropic, Google, etc.).

### Step 7 — Secure and deploy
- Rotate/add your keys in `.env.local`.
- Update `ALLOWED_HOSTS` when publishing.
- Deploy the server to Render / Vercel as per [Section 9](#9-how-to-deploy-for-free).

### Evolution ideas for your agent
- **Conversation persistence** (save messages in a database).
- **Authentication** (each user has their own session).
- **New data sources** (SQL, paid APIs, webhooks).
- **Writing/action tools** (create files, send emails, schedule) — always with **human approval** for destructive actions.
- **Queue/retry** for LLM rate limits.
- **Multiple MCP clients** (connect to several MCP servers at once).

---

## 13. Glossary

| Term | Definition |
| --- | --- |
| **LLM** | Large Language Model; the model that understands/generates text (here: Groq/qwen). |
| **Agent** | A system where an LLM **decides actions** (calls tools) to accomplish tasks. |
| **Tool** | A function exposed to the LLM with a name, description and schema; can be called during the response. |
| **Tool calling** | The mechanism where the LLM emits structured tool calls and the code executes them. |
| **MCP** | Model Context Protocol; open protocol for agents to discover/call tools from external servers. |
| **MCP Server** | Process that exposes tools via MCP (here: `server/`). |
| **MCP Client** | Process that consumes an MCP server's tools (here: `web/lib/mcp.ts`). |
| **Streamable HTTP** | MCP transport over HTTP with streaming. |
| **AI SDK (Vercel)** | Library that unifies LLM providers, streaming and tool calling. |
| **`streamText`** | AI SDK function that generates text in streaming, with tool support. |
| **`useChat`** | `@ai-sdk/react` hook that manages chat state and streaming in the browser. |
| **Schema (Zod/JSON)** | Structured description of a data's shape (validation and documentation). |
| **System prompt** | System instructions sent to the LLM defining the agent's role and rules. |
| **Cold start** | Delay on the first response of *serverless* services that "sleep" when idle (Render free). |
| **DNS rebinding** | Attack where a malicious domain points to an internal IP; mitigated by `ALLOWED_HOSTS`. |

---

*Documentation generated from a complete analysis of the `ai-agent-mcp-demo` project source code. For summarized install/deploy instructions, see the [`README.md`](../README.md).*
