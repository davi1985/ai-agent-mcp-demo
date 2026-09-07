# Documentação Completa — Projeto `ai-agent-mcp-demo`

Um guia didático e completo sobre como este projeto funciona, pensado para um desenvolvedor que quer **entender 100%** da implementação e, a partir daqui, criar o **seu próprio agente de IA**.

> Se você usa o **Claude Code** como ferramenta de trabalho (planejar features, corrigir bugs), este documento serve de ponte: ele usa a mesma família de conceitos ("agente", "ferramentas", "prompts") que você já vê no dia a dia, mas agora explica como eles são **construídos do zero num código**.

---

## Índice

1. [O que este projeto é (em uma frase e em mais detalhes)](#1-o-que-este-projeto-é)
2. [Conceitos fundamentais (leia antes de tudo)](#2-conceitos-fundamentais)
3. [Arquitetura geral — visão de pássaro](#3-arquitetura-geral)
4. [Fluxo de uma mensagem, passo a passo](#4-fluxo-de-uma-mensagem)
5. [O servidor MCP (`server/`)](#5-o-servidor-mcp)
   - [index.ts — entrada e endpoints](#51-indexts)
   - [Como as ferramentas são registradas](#52-como-as-ferramentas-são-registradas)
   - [Cada ferramenta em detalhe](#53-cada-ferramenta-em-detalhe)
6. [O frontend Web (`web/`)](#6-o-frontend-web)
   - [Camada MCP do cliente (`lib/mcp.ts`)](#61-libmcp-como-o-cliente-fala-com-o-servidor)
   - [Prompts do sistema (`lib/prompts.ts`)](#62-libpromptsts)
   - [A API do agente (`app/api/agent/route.ts`) — o "cérebro"](#63-a-api-do-agente)
   - [A API de health check](#64-a-api-de-health)
   - [Componentes React](#65-componentes-react)
7. [Configuração e variáveis de ambiente](#7-configuração-e-variáveis-de-ambiente)
8. [Como rodar, desenvolver e depurar](#8-como-rodar-desenvolver-e-depurar)
9. [Como fazer deploy grátis](#9-como-fazer-deploy-grátis)
10. [Decisões de design e porquês](#10-decisões-de-design-e-porquês)
11. [Segurança e boas práticas](#11-segurança-e-boas-práticas)
12. [Como construir SEU próprio agente — passo a passo](#12-como-construir-seu-próprio-agente)
13. [Glossário](#13-glossário)

---

## 1. O que este projeto é

**Em uma frase:** é um **chat** onde o usuário faz perguntas em linguagem natural (clima, matemática, perfil do GitHub, pesquisa na web) e um **modelo de IA** responde **chamando ferramentas reais em tempo real**, cujo resultado aparece ao vivo na interface.

**Em mais detalhes:** a IA não tem o conhecimento do clima nem dos repositórios do GitHub "na cabeça". Ela tem acesso a **ferramentas** (funções que buscam dados reais) e decide, a cada pergunta, **qual ferramenta chamar e com quais argumentos**. Esse é o coração de um **agente**: um modelo que **age** (chama funções), não só que **fala** (gera texto).

O projeto foi feito com um requisito forte: **custo zero** (todos os serviços têm plano grátis, sem cartão de crédito). Isso influenciou cada escolha de tecnologia.

---

## 2. Conceitos fundamentais

Para um dev novo em agentes, estes são os conceitos que destravam toda a leitura do código:

### 2.1 Modelo de linguagem (LLM)
O "cérebro" que entende texto e gera texto. Ele **não tem acesso a dados reais do mundo** por si só — só conversa. Neste projeto é o **Groq** (`qwen/qwen3.8-27b`).

### 2.2 Ferramenta (Tool)
Uma função com **nome, descrição e um esquema de entrada (schema)**. O modelo lê essas descrições e "decide" chamar a ferramenta quando achar necessário. Ex.: `get_weather(city)`.

### 2.3 Tool calling (chamada de ferramenta)
É o mecanismo pelo qual o LLM, durante a geração da resposta, emite uma chamada estruturada do tipo `{ tool: "get_weather", args: { city: "Tokyo" } }`. O código executa a função real, pega o resultado e devolve ao modelo, que então escreve a resposta final **baseada** nesse resultado.

### 2.4 MCP — Model Context Protocol
É o **protocolo** (um padrão aberto, da Anthropic — os criadores do Claude) que padroniza como um agente **descobre e chama ferramentas** fornecidas por um **servidor externo**. É como um "USB de ferramentas": um servidor MCP expõe ferramentas; qualquer cliente MCP pode usá-las.

A grande vantagem do MCP aqui: **as ferramentas não são hardcoded no frontend**. O cliente pede a lista de ferramentas ao servidor em tempo de execução (`tools/list`) e constrói os executores em cima disso. Se amanhã você adicionar uma ferramenta nova no servidor, o frontend a usa automaticamente, sem mexer nele.

### 2.5 AI SDK (Vercel)
Uma biblioteca (da Vercel) que unifica o acesso a vários provedores de LLM (OpenAI, Anthropic, Groq etc.) com uma API comum. Aqui usamos:
- **`ai`** — o núcleo (função `streamText` para gerar resposta em streaming com tool calling).
- **`@ai-sdk/react`** — hook `useChat` para a UI.
- **`@ai-sdk/openai-compatible`** — adaptador para serviços compatíveis com a API da OpenAI (é o caso do Groq).

### 2.6 Streaming
Em vez de esperar a resposta inteira pronta, o servidor vai enviando os "pedaços" assim que são gerados. Isso dá a sensação de digitação em tempo real e, durante tool calls, permite mostrar spinners.

### 2.7 Transporte Streamable HTTP
É o jeito de dois processos falarem MCP pela rede usando HTTP (+ streaming por SSE/event stream). O servidor expõe o endpoint `/mcp`; o cliente se conecta a ele.

---

## 3. Arquitetura geral

O projeto tem **duas aplicações independentes** + um script que as sobe juntas:

```
┌────────────────────────────────────────────┐        ┌──────────────────────────────────────┐
│           FRONTEND  (web/ — Next.js)       │        │           SERVIDOR (server/)          │
│                                            │  HTTP  │                                      │
│  Browser ←→ Next.js App Router             │ ──────▶ │  Express 5  +  MCP  (@modelcontext) │
│       │                                    │  /mcp   │       │                             │
│       │ useChat (@ai-sdk/react)            │         │       ├─ get_weather  (Open-Meteo)   │
│       ▼                                    │         │       ├─ web_search   (Wikipedia)    │
│  POST /api/agent  — o "cérebro"            │         │       ├─ calculate    (mathjs)       │
│   · conecta ao MCP server                  │         │       └─ get_github_user (GitHub)    │
│   · descobre as ferramentas                │         │                                      │
│   · chama o LLM com tool calling           │         │       GET /      → info               │
│   · faz stream da resposta                 │         │       GET /health → status            │
│                                            │         │                                      │
│  GET /api/health — sonda o servidor MCP    │         │                                      │
└────────────────────────────────────────────┘        └──────────────────────────────────────┘
```

**Papéis:**
- **`server/`** — "cofre das ferramentas". Um processo Node que sabe fazer as 4 coisas reais (clima, busca, cálculo, GitHub) e as expõe pelo protocolo MCP.
- **`web/`** — a "cara do agente". Interface de chat que conecta o usuário ao modelo e às ferramentas.
- **`dev.sh`** — orquestra os dois localmente.

---

## 4. Fluxo de uma mensagem

Vamos seguir uma pergunta real, tipo *"What's the weather in Tokyo?"*:

1. **Usuário digita** no campo de entrada do navegador.
2. O hook `useChat` (frontend) envia a pergunta para `POST /api/agent`.
3. A API do agente faz **`connectMcp()`** → abre uma sessão MCP contra o servidor (`http://localhost:3000/mcp`).
4. Chama **`buildToolSet()`** → pede ao servidor `tools/list`, que devolve a lista das 4 ferramentas com nome, descrição e schema; o código converte cada uma num executor compatível com o AI SDK.
5. Chama **`streamText()`** com: o modelo Groq, o **system prompt**, o histórico de mensagens, e o conjunto de ferramentas.
6. O LLM "pensa": *a pessoa quer o clima, tenho a ferramenta `get_weather`*. Emite um **tool call**: `get_weather(city: "Tokyo")`.
7. O AI SDK executa o executor da ferramenta → que chama `client.callTool()` no servidor MCP → que busca o clima no Open-Meteo → devolve o texto formatado.
8. O **resultado é devolvido ao LLM**, que agora escreve a resposta final ("Em Tóquio está 24°C...") baseada nele.
9. A resposta é transmitida em **stream** de volta ao navegador; na UI, o cartão de tool call aparece com spinner e depois com o resultado.
10. Ao terminar, a sessão MCP é **fechada** (`closeMcp`).

Esse ciclo "modelo decide → roda ferramenta → devolve resultado → modelo responde" pode se repetir várias vezes (aqui, no máx. 8 passos, controlado por `isStepCount(8)`).

---

## 5. O servidor MCP

### 5.1 `index.ts`

Localização: `server/src/index.ts`.

É o ponto de entrada do servidor. Faz, em ordem:

1. **Lê configurações de ambiente**: `MCP_SERVER_NAME` (nome exposto), `PORT` (default 3000), `ALLOWED_HOSTS`.

2. **`buildServer()`** — cria a instância `McpServer` (do pacote `@modelcontextprotocol/server`) e **registra as 4 ferramentas**. Este é o coração da extensibilidade: para adicionar uma ferramenta, basta criar um `registerXxxTool(server)` e chamá-lo aqui.

3. **`createMcpHandler(buildServer)`** — cria o handler que processa os requests do protocolo MCP (lista ferramentas, chama ferramentas).

4. **`createMcpExpressApp(...)`** — monta a camada Express que expõe o MCP. Repare em dois detalhes importantes:
   - `host: '0.0.0.0'` — escuta em todas as interfaces de rede (essencial para o servidor ser acessível de fora, não só em `localhost`).
   - `allowedHosts: ALLOWED_HOSTS` — proteção contra **DNS rebinding** (ver [Seção 11](#11-segurança-e-boas-práticas)).

5. **Rotas HTTP auxiliares**:
   - `GET /` → retorna um JSON com nome, versão, lista de ferramentas, URL do health e link para o spec MCP.
   - `GET /health` → retorna `{ status, name, version, tools, uptime, timestamp }`. É o que o frontend consulta para saber se o servidor está de pé.

6. **`app.all('/mcp', ...)`** — a **rota MCP principal**. Todos os verbos HTTP passam por aqui; o `toNodeHandler` traduz cada request HTTP em operação do protocolo MCP (list/call tools). É aqui que o protocolo "vive".

7. **`app.listen(PORT, ...)`** — sobe o servidor e loga no console o endpoint.

8. **`SIGINT` handler** — fecha a sessão do handler MCP com elegância quando o processo recebe Ctrl+C.

**Nota sobre `reqHostBase`:** função que monta a URL base pública (usa `PUBLIC_URL` se definido, senão `http://localhost:PORT`). Só é usada para montar o link de health no `GET /`.

### 5.2 Como as ferramentas são registradas

Cada ferramenta é um módulo que exporta uma função `registerXxxTool(server)`. Dentro dela chamamos:

```ts
server.registerTool(
  'nome_da_ferramenta',          // nome único que o modelo usará
  {
    description: '...',           // descrição que o LLM lê para decidir quando usar
    inputSchema: z.object({ ... }), // schema de entrada (valida os argumentos)
  },
  async (args) => { ... },        // executor: faz a ação real e retorna texto
)
```

Três pontos importantes desse padrão:

- **A `description` é o "manual do LLM"**. Quanto melhor ela indicar *quando usar*, melhor o modelo decide. O código capricha aqui (ex.: "Use this whenever the user asks about the weather").
- **O `inputSchema` (Zod)** valida os argumentos que o modelo envia. O Zod também serve para o AI SDK e o MCP saberem a forma exata dos dados.
- **O executor retorna um texto formatado** em vez de JSON bruto, porque é mais legível para o modelo incorporar na resposta final.

Um padrão consistente em todas as ferramentas para **erros**: se a função interna retorna uma string começando com `"ERROR"`, o executor a converte num **resultado de erro MCP** (`isError: true`), removendo o prefixo. Isso permite que o erro seja tratado e formatado sem quebrar o protocolo.

### 5.3 Cada ferramenta em detalhe

#### 5.3.1 `get_weather` (`server/src/tools/weather.ts`)

- **Cenário de uso:** "Qual o clima em São Paulo?" / "Está frio no Rio?"
- **Entrada:** `city` (obrigatório, 1–80 chars) e `country` (opcional, para desambiguar cidades homônimas).
- **Como funciona por dentro:**
  1. **Geocodificação** no Open-Meteo (`GEOCODING_URL`): transforma o nome da cidade em **latitude/longitude**.
  2. Faz **normalização de acentos** (remove acentos via `normalize('NFD')`) para casar nomes escritos de formas diferentes.
  3. Traduz nomes de países **em português** (ex.: "brasil" → "brazil") para casar com o que a API devolve.
  4. Busca a previsão (`FORECAST_URL`) com um fallback para `wttr.in` caso o Open-Meteo falhe (`fetchForecast` tenta um, depois o outro).
  5. Usa um dicionário `WEATHER_CODES` para transformar o código numérico do tempo em texto legível (ex.: `0` → "Clear sky").
  6. Monta uma resposta formatada com condição, temperatura (e sensação térmica), umidade e vento.

- **Ferramentas externas gratuitas:** Open-Meteo (geocoding + forecast) e wttr.in (fallback). Nenhuma precisa de API key.

#### 5.3.2 `web_search` (`server/src/tools/search.ts`)

- **Cenário de uso:** "Quem criou o Vercel?" / fatos, pessoas, tecnologias.
- **Entrada:** `query` (1–200 chars) e `limit` opcional (1–5, default 3).
- **Como funciona:** chama a **MediaWiki API** (Wikipedia) com `action=query&list=search`. Formata os resultados com título, URL (`https://en.wikipedia.org/wiki/Nome`) e snippet (removendo tags HTML).
- **Limitação honesta do projeto:** não é um "Google". É uma busca na Wikipedia. Para o demo basta e é gratuito.

#### 5.3.3 `calculate` (`server/src/tools/calculate.ts`)

- **Cenário de uso:** "Quanto é (15% de 4.800) + 120?"
- **Entrada:** `expression` (1–200 chars).
- **Como funciona:** usa **`mathjs`** para avaliar a expressão, mas com **uma camada de segurança**: um `ALLOWED_CHARS` (regex) só permite números, operadores `+-*/^()` `%`, espaços, vírgula/ponto e letras minúsculas. Qualquer caractere fora disso é rejeitado **antes** de avaliar — isso impede injeção de código/expressões maliciosas. Também valida que o resultado é um número finito.
- **Formatação:** inteiro vira string direto; decimal é arredondado para 6 casas.

#### 5.3.4 `get_github_user` (`server/src/tools/github.ts`)

- **Cenário de uso:** "Mostra o perfil do openai no GitHub".
- **Entrada:** `username` (1–39 chars).
- **Como funciona:** chama a **API pública do GitHub** (`api.github.com/users/:username`) para o perfil e depois `/repos?sort=updated&per_page=5` para os 5 repositórios mais recentemente atualizados. A função `fetchJson<T>` é genérica e trata o caso 404 (usuário não encontrado) e rate limit. Formata nome, bio, localização, empresa, site, contadores (repos/followers/following) e repositórios (nome, estrelas, linguagem, descrição).

---

## 6. O frontend Web

### 6.1 `lib/mcp.ts` — como o cliente fala com o servidor

Este arquivo é a **camada MCP do lado do cliente**. Tem 3 funções:

- **`connectMcp()`** — instancia o `Client` MCP (`@modelcontextprotocol/client`), cria um `StreamableHTTPClientTransport` apontando para `MCP_SERVER_URL` (default `http://localhost:3000/mcp`) e conecta. Lança erro se o servidor não estiver acessível (ex.: cold start do Render).
- **`closeMcp()`** — encerra a sessão. Primeiro tenta `terminateSession()` (função específica do transporte) e depois `client.close()`, ambos com `catch` silencioso (best-effort).
- **`buildToolSet(client)`** — a peça-chave da "descoberta dinâmica":
  1. Chama `client.listTools()`, que retorna as ferramentas do servidor MCP.
  2. Para cada ferramenta, monta uma entrada do **ToolSet do AI SDK**, com:
     - `description` (a do MCP, ou um fallback);
     - `inputSchema: jsonSchema(schema)` — converte o schema MCP (JSON Schema) para o formato que o AI SDK entende;
     - `execute(args)` — chama `client.callTool()` no servidor MCP, extrai o texto dos blocos de conteúdo e, se `isError`, devolve um resultado de erro.
  3. Junta tudo num objeto `ToolSet` com `Object.fromEntries`.

É graças a essa função que o frontend **não tem as ferramentas gravadas em código**: ele as descobre a cada request. Isso é a essência do MCP no projeto.

### 6.2 `lib/prompts.ts`

Contém o **`SYSTEM_PROMPT`**, o "manual de instruções" do agente, que é enviado ao LLM a cada conversa. Ele diz:

- o papel do agente (responder usando ferramentas ao vivo);
- **quais ferramentas existem** e para que servem;
- **regras de comportamento**: preferir ferramentas a adivinhar, chamar cada ferramenta no máximo 1x por passo, nunca inventar nomes/cidades/números/fatos, dizer quando algo não foi encontrado, responder no mesmo idioma do usuário, e manter as respostas **curtas (menos de 150 palavras, sem markdown/emoji)**.

Esse prompt é o que mais molda o "comportamento" do agente — mexer nele é a forma mais rápida de mudar a personalidade/regras do bot.

### 6.3 A API do agente — `app/api/agent/route.ts`

Este é o "cérebro" do agente. É uma rota **POST** do App Router do Next.js. Vamos ver o que cada parte faz:

- **Metadados da rota (`runtime`, `dynamic`, `maxDuration`):** força Node.js runtime, garante que é renderizada a cada request (não cacheada), e limita 60s de execução.

- **Leitura de ambiente:** `GROQ_API_KEY` e `MODEL` (default `qwen/qwen3.8-27b`).

- **`createOpenAICompatible(...)`:** cria o provedor de LLM apontando para a API do Groq (`https://api.groq.com/openai/v1`), porque o Groq é compatível com a API da OpenAI.

- **Validação da entrada:** espera um corpo `{ messages: UIMessage[] }` e rejeita com 400 se não houver mensagem de usuário.

- **Conexão com o MCP:** `await connectMcp()`. Se falhar, responde **503** com uma mensagem amigável sobre o cold start do Render. (Isso é o tratamento de erro que a UI converte numa dica útil.)

- **Montagem e streaming:**
  ```ts
  const tools = await buildToolSet(client)
  const result = streamText({ model, system, messages, tools, ... })
  ```
  - `streamText` gera a resposta em streaming, com capacidade de tool calling.
  - `convertToModelMessages(...)` traduz as mensagens da UI para o formato do modelo (filtrando partes de `reasoning`).
  - `stopWhen: isStepCount(8)` — limita o agente a **8 passos de tool call** no máximo (evita loop infinito).
  - `onFinish: () => closeMcp(client)` — fecha a sessão MCP ao final.
  - `createUIMessageStreamResponse({ stream: toUIMessageStream(...) })` — transforma o stream do modelo no **protocolo de mensagens UI** do AI SDK, que o `useChat` consome no navegador.

- **Tratamento de erros:** fecha o MCP e responde 500 com a mensagem do erro.

### 6.4 A API de health — `app/api/health/route.ts`

É um **proxy de saúde**: o navegador chama `/api/health` (no próprio frontend), e essa rota consulta `/health` do servidor MCP. Motivos para ter um proxy e não chamar o MCP direto do navegador:
1. O navegador **não** deve falar MCP/HTTP com o servidor interno diretamente (e nem ter a `MCP_SERVER_URL` exposta no cliente de forma sensível);
2. Centraliza a lógica de esperar o cold start.

Ela:
- Constrói a URL de health a partir de `MCP_SERVER_URL` (`new URL('health', ...)`).
- Usa `AbortController` com timeout de **8s** (se o servidor não responder nesse tempo, assume "waking"/cold start).
- Retorna `status: 'ok'` se respondeu, ou `status: 'waking'` com detalhe caso contrário.

### 6.5 Componentes React

#### 6.5.1 `ChatInterface.tsx` — a tela de chat
- Usa o hook **`useChat`** do `@ai-sdk/react` com `DefaultChatTransport({ api: '/api/agent' })`. O `DefaultChatTransport` gerencia a comunicação (POST + stream) com a rota do agente, incluindo a serialização das partes de tool call.
- **Botões de atalho (`STARTERS`)**: 4 cards de exemplo (clima, busca, matemática, GitHub) que preenchem a pergunta e disparam a chamada.
- **Renderização das partes**: uma função `renderPart` lida com tipos de conteúdo do `UIMessage`:
  - `text` → parágrafo da bolha;
  - `step-start` → divisor visual entre etapas de tool call;
  - `dynamic-tool` / `tool-*` → cartão de tool call (`ToolCallCard`);
  - `reasoning` → texto de raciocínio (itálico, estilizado).
- **Estado de streaming**: desabilita o input e mostra o botão "■ Stop" enquanto `status` é `submitted`/`streaming`. `stop()` cancela a geração.
- **Tratamento de erro amigável**: exibe dica específica dependendo do erro (rate limit do Groq vs. cold start do Render).

#### 6.5.2 `ToolCallCard.tsx` — visualização da chamada de ferramenta
Mostra cada invocação de ferramenta numa card:
- **Mapeia nomes** para rótulos legíveis (`get_weather` → "Weather", etc.).
- **Estados visuais**: spinner com borda roxa enquanto pendente; ✓ verde quando concluída; vermelho quando erro.
- Exibe os **argumentos** (`city=Tokyo`) na linha do cabeçalho.
- Exibe a **saída** num bloco `<pre>` monoespaçado (colapsável por altura máxima com scroll).

#### 6.5.3 `ServerStatus.tsx` — banner de status do servidor
- Faz **polling** no `/api/health` a cada 5s enquanto o servidor não estiver pronto.
- Três estados: `checking` (círculo pulsando), `ok` (verde), `waking` (roxo pulsando + explicação "Render free tier cold start ~30–60s" + botão "Retry now").
- Usa `useEffect` com `cancelled` flag e `clearTimeout` no cleanup para evitar vazamento de memória.

---

## 7. Configuração e variáveis de ambiente

### Servidor (`server/.env.example`)

| Variável | Default | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta do MCP server (o Render define sozinho). |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Hosts permitidos (proteção DNS rebinding). |

(Opcional no código, não está no `.env.example`: `MCP_SERVER_NAME` e `PUBLIC_URL`.)

### Frontend (`web/.env.example`)

| Variável | Default | Descrição |
| --- | --- | --- |
| `GROQ_API_KEY` | — | Chave da API do Groq (obrigatória; prefixo `gsk_`). |
| `MCP_SERVER_URL` | `http://localhost:3000/mcp` | Endpoint MCP do servidor. |
| `MODEL` | `qwen/qwen3.8-27b` | Modelo usado pelo Groq. |

> **Importante:** o `GROQ_API_KEY` vive **apenas no servidor** (variável de ambiente do Next.js). Ele nunca é exposto ao navegador — isso é uma boa prática de segurança (ver [Seção 11](#11-segurança-e-boas-práticas)).

---

## 8. Como rodar, desenvolver e depurar

### Pré-requisitos
- **Node.js 20+** (testado com v24.19.0).
- Chave do Groq grátis em [console.groq.com](https://console.groq.com).

### Rápido (recomendado)
```bash
cp web/.env.example web/.env.local   # depois cole sua GROQ_API_KEY
./dev.sh
```
Isso sobe o MCP server em **3000** e o frontend em **3001**, e mata os dois com Ctrl+C.

### Manual (dois terminais)
```bash
# Terminal 1 — MCP server
cd server && yarn && yarn dev        # http://localhost:3000/mcp

# Terminal 2 — Frontend
cd web && yarn && yarn dev           # http://localhost:3001
```

### Scripts úteis
- `server`: `yarn dev` (tsx watch, recarrega ao salvar), `yarn build` (tsc → `dist/`), `yarn start` (roda o build), `yarn typecheck`.
- `web`: `yarn dev`, `yarn build`, `yarn start`, `yarn typecheck`.

### Depurando
- **Testar o servidor MCP sozinho**: abra `http://localhost:3000/` (info) e `http://localhost:3000/health`. Você também pode usar um cliente MCP (ex.: extensão MCP Inspector) em `http://localhost:3000/mcp`.
- **Logs do servidor**: o `console.error` no `listen` aparece no terminal do `server`.
- **Testar a API do agente**: `curl http://localhost:3001/api/health` para o health.
- **Ver os tool calls**: na UI, os `ToolCallCard` mostram argumentos e saídas — é o melhor jeito de ver o que o modelo decidiu.

---

## 9. Como fazer deploy grátis

### MCP server → Render (grátis)
1. Suba o repositório para o GitHub.
2. **Render → New → Web Service**, conecte o repo, **root directory** `server`, build `yarn && yarn build`, start `yarn start`.
3. Adicione a env var `ALLOWED_HOSTS=<seu-subdominio>.onrender.com`.
4. O free tier "dorme" após ~15 min de inatividade — o frontend lida com o wake-up automaticamente.

### Frontend → Vercel (Hobby, grátis)
1. **Vercel → Add New → Project**, conecte o repo, **root directory** `web`.
2. Envs: `GROQ_API_KEY`, `MCP_SERVER_URL=https://<seu-subdominio>.onrender.com/mcp`.
3. Deploy.

> O conceito de "cold start" aparece porque o Render free dorme; o frontend foi projetado para detectar e esperar isso (ServerStatus + 503 na API do agente).

---

## 10. Decisões de design e porquês

| Decisão | Porquê |
| --- | --- |
| **MCP para as ferramentas** | Padroniza descoberta/chamada de ferramentas; frontend não guarda tools hardcoded; extensível sem tocar no cliente. |
| **Dois processos separados** (`server/` + `web/`) | Desacopla o "provedor de ferramentas" do "agente". O mesmo MCP server pode servir vários clientes/agentes. |
| **Groq + `openai-compatible`** | Modelo rápido e **grátis**, e o Groq expõe uma API compatível com a OpenAI — o AI SDK já tem adaptador pronto. |
| **AI SDK v7 (`streamText`)** | Abstrai provedores e gerencia tool calling + streaming com uma API só. |
| **Descrições ricas nas tools** | O LLM decide pela descrição; descrições boas = decisões boas. É a "qualidade" do agente. |
| **Zod para schemas** | Validação de entrada segura e declaração clara do formato, que também é convertida para JSON Schema consumido pelo MCP/AI SDK. |
| **`isStepCount(8)`** | Limita passos de tool call para evitar loops infinitos custosos. |
| **Respostas de tools como texto formatado** | Texto legível é mais fácil de o modelo incorporar na resposta final do que JSON cru. |
| **`ALLOWED_HOSTS` mitiga DNS rebinding** | O Render free expõe o servidor na internet pública; o DNS rebinding é uma classe de ataque relevante aí. |
| **Cold-start handling explícito** | O Render free dorme; sem esse tratamento, a primeira interação pareceria "quebrada". |
| **Server-side `GROQ_API_KEY`** | A chave nunca vai ao browser, reduzindo risco de vazamento. |
| **`web_search` via Wikipedia** | Alternativa gratuita e sem API key; sacrifício de qualidade em troca de custo zero. |

---

## 11. Segurança e boas práticas

1. **Nunca comitar segredos.** Note que `web/.env.local` **contém uma chave real do Groq** — está no `.gitignore`, mas vale a pena **rotacionar** (gerar nova no console do Groq) já que foi exibida. Sempre deixe apenas `.env.example` versionado.
2. **Segredos só no servidor.** A `GROQ_API_KEY` é lida via `process.env` no código do Next.js (server-side) e **não** é usada no client. Não exponha keys via variáveis `NEXT_PUBLIC_*`.
3. **Validação de entrada.** O Zod valida os argumentos de toda ferramenta; o `calculate` ainda aplica uma regex whitelist para evitar injeção de código em `mathjs`.
4. **Proteção contra DNS rebinding.** O `ALLOWED_HOSTS` restringe quais `Host` headers o servidor aceita. Ao publicar, atualize para incluir seu domínio real.
5. **Rate limiting do LLM.** O Groq free tem limite de tokens/min. O frontend já exibe uma dica quando isso acontece; num app de produção você pode adicionar filas/retry e limits por usuário.
6. **Limites de execução.** `maxDuration` (rota), `maxOutputTokens` (1024) e `isStepCount(8)` evitam custos/falhas imprevistas.
7. **HTTPs em produção.** Tanto o Render quanto o Vercel já fornecem HTTPS; o `MCP_SERVER_URL` de produção deve usar `https`.

---

## 12. Como construir SEU próprio agente — passo a passo

Este é o roteiro prático para criar algo seu a partir deste modelo.

### Etapa 0 — Decida o escopo
Pergunte-se: **que tarefas reais o seu agente fará?** (buscar no banco? consultar API? calcular? agendar?). Cada tarefa vira uma **ferramenta**.

### Etapa 1 — Monte a base (clone/copie a estrutura)
Copie a estrutura de pastas `server/` e `web/`. Instale as dependências com `yarn`.

### Etapa 2 — Adicione suas ferramentas no servidor
1. Crie `server/src/tools/minhaTool.ts`.
2. Escreva a função que faz a ação real (ex.: `buscarUsuario()` chamando um banco ou API externa).
3. Registre com `server.registerTool('minha_tool', { description, inputSchema }, handler)`.
4. Importe e chame o `register` em `buildServer()` no `index.ts`.

**Regra de ouro:** escreva a `description` como se estivesse instruindo alguém a usar — "Use this when the user asks about X". Isso define a precisão do seu agente. Defina o `inputSchema` com Zod com `min`/`max`/`.describe()` para clareza.

### Etapa 3 — (Opcional) New tools aparecem sozinhas
Como o frontend descobre ferramentas via `tools/list`, **suas novas ferramentas já funcionarão no chat sem mexer no frontend** (o `ToolCallCard` exibirá o nome cru se não estiver no mapa de rótulos — adicione lá se quiser um rótulo bonito).

### Etapa 4 — Ajuste o prompt do sistema
Em `web/lib/prompts.ts`, liste suas ferramentas e defina as regras do seu agente (idioma, formato, limites, personalidade).

### Etapa 5 — Teste
Rode `./dev.sh`, use os atalhos / converse, e observe os `ToolCallCard` para conferir quais ferramentas o modelo escolheu e com quais argumentos. Ajuste as `description` com base no comportamento observado — **prompt + descrições são o "tuning" do agente**.

### Etapa 6 — Troque/mude o modelo (opcional)
Altere `MODEL` no `.env.local`, ou troque o provedor editando `createOpenAICompatible`/adaptador em `web/app/api/agent/route.ts` (o AI SDK suporta OpenAI, Anthropic, Google, etc.).

### Etapa 7 — Proteja e faça deploy
- Rotacione/adicione suas keys em `.env.local`.
- Atualize `ALLOWED_HOSTS` ao publicar.
- Deploy do servidor em Render / Vercel conforme [Seção 9](#9-como-fazer-deploy-grátis).

### Ideias de evolução para o seu agente
- **Persistência de conversa** (salvar mensagens em banco).
- **Autenticação** (cada usuário tem sua sessão).
- **Novas fontes de dados** (SQL, APIs pagas, webhooks).
- **Ferramentas de escrita/ação** (criar arquivos, enviar e-mails, agendar) — sempre com **aprovação humana** para ações destrutivas.
- **Fila/retry** para rate limits do LLM.
- **MCP clients múltiplos** (conectar a vários servidores MCP de uma vez).

---

## 13. Glossário

| Termo | Definição |
| --- | --- |
| **LLM** | Large Language Model; o modelo que entende/gera texto (aqui: Groq/qwen). |
| **Agente (agent)** | Sistema onde um LLM **decide ações** (chama ferramentas) para cumprir tarefas. |
| **Tool / Ferramenta** | Função exposta ao LLM com nome, descrição e schema; pode ser chamada durante a resposta. |
| **Tool calling** | Mecanismo em que o LLM emite chamadas estruturadas de ferramenta e o código as executa. |
| **MCP** | Model Context Protocol; protocolo aberto para agentes descobrirem/chamarem ferramentas de servidores externos. |
| **MCP Server** | Processo que expõe ferramentas por MCP (aqui: `server/`). |
| **MCP Client** | Processo que consome as ferramentas de um MCP server (aqui: `web/lib/mcp.ts`). |
| **Streamable HTTP** | Transporte do MCP via HTTP com streaming. |
| **AI SDK (Vercel)** | Biblioteca que unifica provedores de LLM, streaming e tool calling. |
| **`streamText`** | Função do AI SDK que gera texto em streaming, com suporte a tools. |
| **`useChat`** | Hook do `@ai-sdk/react` que gerencia o estado e o streaming do chat no navegador. |
| **Schema (Zod/JSON)** | Descrição estruturada da forma de um dado (validação e documentação). |
| **System prompt** | Instruções de sistema enviadas ao LLM que definem papel e regras do agente. |
| **Cold start** | Atraso na primeira resposta de serviços *serverless* que "dormem" quando ociosos (Render free). |
| **DNS rebinding** | Ataque em que um domínio malicioso aponta para IP interno; mitigado por `ALLOWED_HOSTS`. |

---

*Documentação gerada a partir da análise completa do código-fonte do projeto `ai-agent-mcp-demo`. Para instruções de instalação/deploy resumidas, veja o [`README.md`](./README.md).*
