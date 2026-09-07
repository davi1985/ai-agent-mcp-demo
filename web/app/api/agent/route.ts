import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { NextResponse } from 'next/server'
import { buildToolSet, closeMcp, connectMcp } from '@/lib/mcp'
import { SYSTEM_PROMPT } from '@/lib/prompts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const MODEL = process.env.MODEL ?? 'qwen/qwen3.8-27b'

const groq = createOpenAICompatible({
  name: 'groq',
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: GROQ_API_KEY,
})

export const POST = async (req: Request) => {
  const { messages }: { messages: UIMessage[] } = await req.json()

  if (!messages.some((m) => m.role === 'user')) {
    return NextResponse.json(
      { error: 'No user message provided.' },
      { status: 400 },
    )
  }

  let client

  try {
    client = await connectMcp()
  } catch (err) {
    return NextResponse.json(
      {
        error:
          'The MCP server is not reachable yet. It runs on the Render free tier and may be waking up (cold start ~30–60s). Try again in a moment.',
        detail: (err as Error).message,
      },
      { status: 503 },
    )
  }

  try {
    const tools = await buildToolSet(client)

    const result = streamText({
      model: groq(MODEL),
      system: SYSTEM_PROMPT,
      maxOutputTokens: 1024,
      messages: await convertToModelMessages(
        messages.map((m) => ({
          ...m,
          parts: m.parts.filter((p) => p.type !== 'reasoning'),
        })),
      ),
      tools,
      stopWhen: isStepCount(8),
      onFinish: () => void closeMcp(client),
    })

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    })
  } catch (err) {
    await closeMcp(client)
    return NextResponse.json(
      {
        error: `Failed to prepare agent tools: ${(err as Error).message}`,
      },
      { status: 500 },
    )
  }
}
