import type { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { evaluate } from 'mathjs'

const MAX_EXPRESSION_LENGTH = 200
const ALLOWED_CHARS = /^[0-9+\-*/^().,%\s[a-z]+$/i

export const registerCalculateTool = (server: McpServer): void => {
  server.registerTool(
    'calculate',
    {
      description:
        'Evaluate a mathematical expression safely and return the numeric result. Supports +, -, *, /, ^, parentheses, percentages and functions like sqrt, log, sin, cos, tan, abs, round, floor, ceil. Use this for any arithmetic the user asks about.',
      inputSchema: z.object({
        expression: z
          .string()
          .min(1)
          .max(MAX_EXPRESSION_LENGTH)
          .describe(
            'The mathematical expression to evaluate, e.g. "2 + 3 * 4"',
          ),
      }),
    },
    async ({ expression }) => {
      const text = evaluateExpression(expression)
      return text.startsWith('ERROR')
        ? { content: [{ type: 'text', text: text.slice(6) }], isError: true }
        : { content: [{ type: 'text', text }] }
    },
  )
}

const evaluateExpression = (expression: string): string => {
  const trimmed = expression.trim()

  if (!ALLOWED_CHARS.test(trimmed)) {
    return 'ERROR Expression contains unsupported characters. Only numbers and math operators are allowed.'
  }

  try {
    const value = evaluate(trimmed)
    if (
      typeof value !== 'number' ||
      Number.isNaN(value) ||
      !Number.isFinite(value)
    ) {
      return 'ERROR The expression did not produce a finite numeric result.'
    }
    const formatted = Number.isInteger(value)
      ? String(value)
      : String(Math.round(value * 1e6) / 1e6)
    return `${trimmed} = ${formatted}`
  } catch (err) {
    return `ERROR Invalid expression: ${(err as Error).message}`
  }
}
