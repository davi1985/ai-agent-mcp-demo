import type { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

const GITHUB_API = 'https://api.github.com'
const USER_AGENT = 'mcp-agent-demo/1.0'

interface UserJson {
  login: string
  name?: string | null
  bio?: string | null
  location?: string | null
  blog?: string | null
  company?: string | null
  public_repos: number
  followers: number
  following: number
  created_at: string
  html_url: string
  avatar_url?: string
}

interface RepoJson {
  name: string
  description?: string | null
  language?: string | null
  stargazers_count: number
  html_url: string
}

export const registerGithubTool = (server: McpServer): void => {
  server.registerTool(
    'get_github_user',
    {
      description:
        'Get public information about a GitHub user, including profile info and their most recently updated repositories. Use this when the user asks about any GitHub profile or developer.',
      inputSchema: z.object({
        username: z
          .string()
          .min(1)
          .max(39)
          .describe('GitHub username, e.g. "vercel"'),
      }),
    },
    async ({ username }) => {
      const text = await fetchGithubUser(username)
      return text.startsWith('ERROR')
        ? { content: [{ type: 'text', text: text.slice(6) }], isError: true }
        : { content: [{ type: 'text', text }] }
    },
  )
}

const fetchJson = async <T>(
  url: string,
): Promise<{ ok: boolean; status: number; data?: T }> => {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
    },
  })
  if (res.status === 404) return { ok: false, status: 404 }
  if (!res.ok) return { ok: false, status: res.status }

  return {
    ok: true,
    status: res.status,
    data: (await res.json()) as T,
  }
}

const fetchGithubUser = async (username: string): Promise<string> => {
  try {
    const user = await fetchJson<UserJson>(
      `${GITHUB_API}/users/${encodeURIComponent(username)}`,
    )
    if (!user.ok && user.status === 404) {
      return `ERROR GitHub user "${username}" was not found.`
    }
    if (!user.ok || !user.data) {
      return `ERROR GitHub API error (HTTP ${user.status}). You may be rate limited.`
    }

    const u = user.data
    const joined = new Date(u.created_at).getFullYear()

    const lines = [
      `GitHub profile for ${u.name ?? u.login} (@${u.login}):`,
      `${u.bio ?? 'No bio'}`,
      `- ${u.public_repos} public repos · ${u.followers} followers · ${u.following} following`,
      `- Joined GitHub in ${joined}`,
      `- Profile: ${u.html_url}`,
    ]
    if (u.location) lines.splice(3, 0, `- Location: ${u.location}`)
    if (u.company) lines.splice(3, 0, `- Company: ${u.company}`)
    if (u.blog) lines.splice(3, 0, `- Website: ${u.blog}`)

    const repos = await fetchJson<RepoJson[]>(
      `${GITHUB_API}/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=5`,
    )

    if (repos.ok && repos.data && repos.data.length > 0) {
      const { data } = repos
      lines.push('', 'Recently updated repositories:')

      for (const repo of data.slice(0, 5)) {
        const stars =
          repo.stargazers_count > 0 ? ` (${repo.stargazers_count}★)` : ''
        const desc = repo.description ? ` — ${repo.description}` : ''
        lines.push(
          `- ${repo.name}${stars}: ${repo.language ?? 'unknown'}${desc}`,
        )
      }
    }

    return lines.join('\n')
  } catch (err) {
    return `ERROR GitHub request failed: ${(err as Error).message}`
  }
}
