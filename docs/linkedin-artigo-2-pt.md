# Com o opencode como implementador, eu construí um chatbot de IA de custo zero

Eu descrevi a ideia de um chatbot para um agente de código, o **opencode**, e o código voltou pronto. A parte que vale a pena compartilhar aqui é que isso funcionou porque quem decidiu o que construir fui eu, e quem transformou isso em código foi ele. O projeto é um chat que responde usando ferramentas reais via Model Context Protocol (MCP), com o requisito de custo **zero**.

## Divisão de papéis que funcionou

- Eu defini o **escopo**: clima, busca, cálculo e perfil do GitHub, com o requisito de custo zero.
- Eu defini a **arquitetura**: frontend (Next.js) separado do servidor de ferramentas (MCP), modelo via Groq, streams pelo Vercel AI SDK.
- O opencode **implementou**: criou os módulos, as ferramentas, a UI e o script de desenvolvimento (`dev.sh`).
- Eu **revisei e validei**: rodei os checkers e ajustei prompts e descrições até o comportamento ficar o esperado.

## O cérebro por trás do chat

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

O loop é: o usuário pergunta, o modelo decide qual ferramenta chamar, o servidor MCP executa de verdade, o resultado volta para o modelo e a resposta é transmitida em streaming. O frontend descobre as ferramentas em tempo de execução com `tools/list`, então nada fica hardcoded no cliente.

Um exemplo do que o opencode gerou, a definição da ferramenta de clima:

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

## Infra, deploy e segurança

- **Vercel Hobby** para o frontend, **Render free** para o servidor MCP. Custo $0, ambos com HTTPS.
- São **dois processos independentes**: o provedor de ferramentas fica desacoplado do agente, e o mesmo MCP server poderia servir outros clientes.
- O Render free **dorme** após ~15 min de inatividade. A UI faz polling em `/api/health` e mostra o banner de cold start com retry automático, tratando como recurso, e não como bug.
- `ALLOWED_HOSTS` protege contra DNS rebinding e a `GROQ_API_KEY` vive só do lado do servidor.

## Aprendizados

- **O prompt do sistema vale como especificação.** Eu escrevi em `lib/prompts.ts` o que o agente pode e não pode fazer, e o opencode imediatamente cumpriu como guia ao gerar o código.
- **A qualidade do agente mora nas `description` das tools.** Ajustar essas linhas mudou mais o comportamento do que qualquer outra mudança.
- **Escopo claro acelera o implementador.** Quando o arquiteto define os limites (quais ferramentas, qual custo, qual stack), o sentido do código gerado é muito maior.
- **Revisar código de agente pede o mesmo critério de code review humano:** conferir schemas, segurança, tratamento de erro e limites (como o `isStepCount(8)` que evita loops infinitos).

O código do projeto está em `https://github.com/davi1985/ai-agent-mcp-demo`. Se quer entender como funciona um agente de IA na prática, vale abrir e acompanhar o fluxo de uma pergunta até a ferramenta.

#AgenticAI #MCP #OpenCode #TypeScript #Nextjs #DeployGratis #AI