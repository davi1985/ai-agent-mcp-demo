import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

export const GET = async () => {
  const mcpUrl = process.env.MCP_SERVER_URL

  if (!mcpUrl) {
    return NextResponse.json({
      status: 'misconfigured',
      detail: 'MCP_SERVER_URL is not set',
    })
  }

  const healthUrl = new URL('health', new URL('./', mcpUrl).toString())
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)

  try {
    const res = await fetch(healthUrl, {
      signal: controller.signal,
      cache: 'no-store',
    })

    clearTimeout(timer)

    if (!res.ok) {
      return NextResponse.json({
        status: 'waking',
        detail: `HTTP ${res.status}`,
      })
    }

    const body = (await res.json()) as {
      status: string
      version?: string
      uptime?: number
    }

    return NextResponse.json({ ...body, status: 'ok' })
  } catch {
    clearTimeout(timer)
    return NextResponse.json({ status: 'waking', detail: 'cold start' })
  }
}
