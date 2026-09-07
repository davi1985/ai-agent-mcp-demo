'use client'

type ToolPartState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied'

interface ToolCallCardProps {
  toolName: string
  state: ToolPartState
  input?: unknown
  output?: unknown
  errorText?: string
}

const TOOL_LABELS: Record<string, string> = {
  get_weather: 'Weather',
  web_search: 'Web search',
  calculate: 'Calculation',
  get_github_user: 'GitHub profile',
}

export const ToolCallCard = ({
  toolName,
  state,
  input,
  output,
  errorText,
}: ToolCallCardProps) => {
  const pending = state === 'input-streaming' || state === 'input-available'
  const label = TOOL_LABELS[toolName] ?? toolName

  return (
    <div
      className={`tool-card ${pending ? 'tool-card-pending' : ''} ${state === 'output-error' ? 'tool-card-error' : ''}`}
    >
      <div className="tool-card-head">
        {pending ? (
          <span className="tool-spinner" />
        ) : (
          <span className="tool-check">✓</span>
        )}
        <span className="tool-name">{label}</span>
        {input != null && Object.keys(input as object).length > 0 && (
          <span className="tool-args">
            {Object.entries(input as Record<string, unknown>)
              .map(
                ([k, v]) =>
                  `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`,
              )
              .join(', ')}
          </span>
        )}
      </div>
      {output !== undefined && (
        <pre className="tool-output">
          {typeof output === 'string'
            ? output
            : JSON.stringify(output, null, 2)}
        </pre>
      )}
      {state === 'output-error' && errorText && (
        <div className="tool-error">Error: {errorText}</div>
      )}
    </div>
  )
}
