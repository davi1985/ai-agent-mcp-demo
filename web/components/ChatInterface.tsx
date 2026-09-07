'use client'

import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import ServerStatus from './ServerStatus'
import ToolCallCard from './ToolCallCard'

const STARTERS = [
  {
    icon: '🌤️',
    label: 'Weather in Tokyo',
    text: 'What is the weather in Tokyo right now?',
  },
  {
    icon: '🔎',
    label: 'Search the web',
    text: 'Search the web: who created Vercel?',
  },
  { icon: '🧮', label: 'Math', text: 'Calculate: (15% of 4,800) + 120' },
  {
    icon: '👤',
    label: 'GitHub profile',
    text: 'Show the GitHub profile of openai',
  },
]

type DynamicToolPart = {
  toolName?: string
  toolCallId: string
  state: string
  input?: unknown
  output?: unknown
  errorText?: string
}

function renderPart(part: unknown, index: number) {
  const type = (part as { type: string }).type

  switch (type) {
    case 'text':
      return (
        <p key={index} className="bubble-text">
          {(part as { text: string }).text}
        </p>
      )
    case 'step-start':
      return <hr key={index} className="step-divider" />
    case 'dynamic-tool': {
      const p = part as DynamicToolPart
      return (
        <ToolCallCard
          key={`${p.toolCallId}-${index}`}
          toolName={p.toolName ?? 'tool'}
          state={p.state as 'input-streaming'}
          input={p.input}
          output={p.output}
          errorText={p.errorText}
        />
      )
    }
    default:
      if (typeof type === 'string' && type.startsWith('tool-')) {
        const p = part as DynamicToolPart
        const toolName = p.toolName ?? type.slice('tool-'.length)
        return (
          <ToolCallCard
            key={`${p.toolCallId}-${index}`}
            toolName={toolName}
            state={p.state as 'input-streaming'}
            input={p.input}
            output={p.output}
            errorText={p.errorText}
          />
        )
      }
      if (type === 'reasoning') {
        return (
          <p key={index} className="bubble-reasoning">
            {String((part as { text: string }).text)}
          </p>
        )
      }
      return null
  }
}

export default function ChatInterface() {
  const { messages, sendMessage, error, stop, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/agent' }),
  })

  const [input, setInput] = useState('')
  const streaming = status === 'submitted' || status === 'streaming'
  const showStarters = messages.length === 0

  const submit = async (text: string) => {
    const value = text.trim()
    if (!value || streaming) return
    setInput('')
    await sendMessage({ text: value })
  }

  return (
    <main className="chat-shell">
      <header className="chat-header">
        <div>
          <h1>
            MCP <span>Agent</span>
          </h1>
          <p className="chat-subtitle">
            Live tools via Model Context Protocol · Groq (Llama + GPT-OSS) ·
            100% free
          </p>
        </div>
        <ServerStatus />
      </header>

      <section className="chat-body">
        {showStarters && (
          <div className="starters">
            <p className="starters-hint">Try one of these:</p>
            <div className="starters-grid">
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  className="starter-chip"
                  onClick={() => void submit(s.text)}
                >
                  <span>{s.icon}</span> {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`message message-${message.role}`}>
            <div className="message-label">
              {message.role === 'user' ? 'You' : 'Agent'}
            </div>
            <div className="bubble">
              {message.parts.map((part, i) => renderPart(part, i))}
              {message.role === 'assistant' &&
                streaming &&
                message.id === messages[messages.length - 1].id && (
                  <span className="typing-caret" />
                )}
            </div>
          </div>
        ))}

        {error && (
          <div className="chat-error">
            <strong>Something went wrong.</strong>
            <span>{error.message}</span>
            <p className="chat-error-hint">
              {error.message === 'An error occurred.'
                ? 'This is most likely a Groq rate limit — the free tier caps output tokens per minute. Try a shorter question, or try again in a few seconds.'
                : 'Note: the MCP server runs on the Render free tier, which sleeps when idle. Wait for the banner above to turn green, then retry.'}
            </p>
          </div>
        )}
      </section>

      <footer className="chat-input-bar">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit(input)
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about weather, math, GitHub profiles, or the web…"
            disabled={streaming}
            autoFocus
          />
          {streaming ? (
            <button
              type="button"
              className="send-button stop"
              onClick={() => stop()}
            >
              ■ Stop
            </button>
          ) : (
            <button
              type="submit"
              className="send-button"
              disabled={!input.trim()}
            >
              Send
            </button>
          )}
        </form>
      </footer>
    </main>
  )
}
