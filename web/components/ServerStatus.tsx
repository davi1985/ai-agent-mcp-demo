'use client'

import { useEffect, useRef, useState } from 'react'

type ProbeState = 'checking' | 'ok' | 'waking'

/**
 * Polls /api/health until the MCP server responds. On the Render free tier
 * the server sleeps after ~15 min idle and takes ~30–60s (cold start) to
 * wake up — this banner makes that failure mode explicit instead of confusing.
 */
export default function ServerStatus() {
  const [state, setState] = useState<ProbeState>('checking')
  const [detail, setDetail] = useState('')

  const check = async () => {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      const body = (await res.json()) as {
        status: string
        detail?: string
        version?: string
      }
      if (body.status === 'ok') {
        setState('ok')
        setDetail(`v${body.version ?? ''} online`)
        return true
      }
      setState('waking')
      setDetail(body.detail ?? '')
      return false
    } catch {
      setState('waking')
      setDetail('unreachable')
      return false
    }
  }

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      const ready = await check()
      if (cancelled) return
      if (!ready) {
        timer = setTimeout(poll, 5_000)
      }
    }
    void poll()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state === 'checking') {
    return (
      <div className="status-bar">
        <span className="dot dot-checking" />
        Checking MCP server…
      </div>
    )
  }

  if (state === 'ok') {
    return (
      <div className="status-bar">
        <span className="dot dot-ok" />
        MCP server online
      </div>
    )
  }

  return (
    <div className="status-bar status-bar-waking">
      <span className="dot dot-waking" />
      <span>
        Waking MCP server… (Render free tier cold start ~30–60s)
        {detail ? <span className="status-detail"> · {detail}</span> : null}
      </span>
      <button className="status-retry" onClick={() => void check()}>
        Retry now
      </button>
    </div>
  )
}
