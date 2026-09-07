import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MCP Agent — Model Context Protocol Demo',
  description:
    'A conversational AI agent built with TypeScript and React that discovers and calls tools dynamically over the Model Context Protocol.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
