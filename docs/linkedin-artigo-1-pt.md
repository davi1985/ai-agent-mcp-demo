# Como construí um chat de IA que usa ferramentas reais (MCP na prática)

Eu queria um chatbot que não só conversasse: que respondesse sobre o clima, buscasse fatos, resolvesse contas e mostrasse um perfil do GitHub. E que custasse **zero reais**. Sem cartão de crédito. Isso virou o projeto `ai-agent-mcp-demo`, e é o caso de uso mais simples que eu conheço para entender Model Context Protocol (MCP).

## A ideia em uma frase

O modelo (Groq) não sabe o clima de Tóquio nem os repositórios do GitHub. Ele tem acesso a **ferramentas** e decide, a cada pergunta, qual chamar e com quais argumentos. Quem responde "agora está X graus em Tóquio" é a ferramenta; o LLM só traduz o resultado.

Todo o fluxo passa pelo Vercel AI SDK v7. Do lado do servidor, quatro ferramentas são expostas via MCP: `get_weather` (Open-Meteo), `web_search` (Wikipedia), `calculate` (mathjs) e `get_github_user` (API pública do GitHub). Nenhuma delas precisa de API key.

## Como a aplicação funciona

```
Browser (React / Next.js)
      │  POST /api/agent
      ▼
Next.js + AI SDK v7 (streamText)      MCP server (Express)
      │   tools/list  ◄──────────────  • get_weather
      │   tools/call  ──────────────►  • web_search
      ▼                                • calculate
Browser ←──────── stream ←──────────  • get_github_user
```

O detalhe que muda tudo: o frontend **não tem ferramentas gravadas em código**. O `buildToolSet` pergunta ao servidor o que ele expõe e monta os executores na hora:

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

E o agente é só um `streamText` com essas tools: o modelo emite a tool call, o resultado volta, e a resposta final chega em streaming para o navegador.

```ts
const result = streamText({
  model: groq(MODEL),
  system: SYSTEM_PROMPT,
  messages,
  tools,
  stopWhen: isStepCount(8),
})
```

## Infra e deploy (tudo de graça)

- **Frontend** no **Vercel Hobby**: Next.js, HTTPS, deploys de git, custo $0.
- **Servidor MCP** no **Render free**: roda em um processo Node, mas dorme depois de ~15 min de inatividade.
- Esse "sono" é o famoso **cold start**. A UI detecta via `GET /api/health` (um proxy que só faz polling no servidor) e mostra o banner "acordando…" com retry automático, em vez de parecer que quebrou.
- Os dois serviços são processos separados. Isso desacopla o provedor de ferramentas do agente; o mesmo MCP server poderia servir outros clientes.
- Segurança: `ALLOWED_HOSTS` bloqueia DNS rebinding, o `GROQ_API_KEY` vive só no servidor (variável de ambiente, nunca vai ao browser) e o Zod valida os argumentos de cada tool.

## O que eu aprendi

1. **A descrição da tool é o que define a qualidade do agente.** O LLM decide pelo texto da `description`; uma boa descrição vale mais que azeitar o prompt do sistema.
2. **Zod salva de modelos criativos.** Sem schema, o modelo inventa argumentos. Com `z.object(...)` na `registerTool`, argumento inválido nem chega a rodar.
3. **Limite de passos evita loop infinito.** `isStepCount(8)` custa pouco e encerra a conversa antes que ela vire uma bola de neve cara.
4. **Custo zero é decisão de design, não detalhe.** Ele direcionou cada escolha: Groq no lugar de um provider pago, Open-Meteo e Wikipedia no lugar de APIs com key, Vercel + Render free no lugar de cloud paga.

Se quiser explorar, o código está em `https://github.com/davi1985/ai-agent-mcp-demo`, com documentação completa (pt-BR e en). E se já usa um assistente de código (Claude Code, opencode e afins), os mesmos conceitos de "agente", "tool" e "prompt" que você vê no dia a dia são exatamente os que aparecem aqui, só que construídos do zero.

#AI #MCP #AgenticAI #TypeScript #Nextjs #Vercel #LinkedInTech