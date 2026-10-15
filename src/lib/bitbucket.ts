import type { CachedPr, Settings } from '../types'

const BASE = 'https://api.bitbucket.org/2.0'

export class BitbucketError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'BitbucketError'
  }
}

interface Paginated<T> {
  values: T[]
  next?: string
}

interface RawPr {
  id: number
  title: string
  author?: { display_name?: string }
  links?: { html?: { href?: string } }
  created_on: string
  updated_on: string
  comment_count?: number
  source?: { commit?: { hash?: string } }
  participants?: Array<{ approved?: boolean; user?: { uuid?: string } }>
}

export class Bitbucket {
  constructor(
    private email: string,
    private token: string,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Basic ${btoa(`${this.email}:${this.token}`)}`,
      ...extra,
    }
  }

  private async json<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: this.headers() })
    if (!res.ok) {
      throw new BitbucketError(res.status, `Bitbucket ${res.status} ${res.statusText}`)
    }
    return (await res.json()) as T
  }

  private async paged<T>(url: string, maxPages = 10): Promise<T[]> {
    const out: T[] = []
    let next: string | undefined = url
    for (let i = 0; next && i < maxPages; i++) {
      const page: Paginated<T> = await this.json<Paginated<T>>(next)
      out.push(...page.values)
      next = page.next
    }
    return out
  }

  /** Validates credentials; returns the authenticated user. */
  me(): Promise<{ uuid: string; display_name: string }> {
    return this.json(`${BASE}/user`)
  }

  /** Repo slugs the user is a member of, for the settings picker. */
  async workspaceRepos(workspace: string): Promise<string[]> {
    const repos = await this.paged<{ slug: string }>(
      `${BASE}/repositories/${workspace}?role=member&pagelen=100`,
    )
    return repos.map((r) => r.slug).sort()
  }

  /** Open PRs in one repo where `uuid` is a reviewer. */
  async pendingPrs(workspace: string, repo: string, uuid: string): Promise<CachedPr[]> {
    const q = encodeURIComponent(`state="OPEN" AND reviewers.uuid="${uuid}"`)
    const fields = encodeURIComponent('+values.participants')
    const url = `${BASE}/repositories/${workspace}/${repo}/pullrequests?q=${q}&fields=${fields}&pagelen=50`
    const raw = await this.paged<RawPr>(url)
    return raw.map((pr) => ({
      workspace,
      repo,
      id: pr.id,
      title: pr.title,
      author: pr.author?.display_name ?? 'unknown',
      link: pr.links?.html?.href ?? `https://bitbucket.org/${workspace}/${repo}/pull-requests/${pr.id}`,
      createdOn: pr.created_on,
      updatedOn: pr.updated_on,
      commentCount: pr.comment_count ?? 0,
      approvedByMe:
        pr.participants?.some((p) => p.user?.uuid === uuid && p.approved) ?? false,
      sourceCommit: pr.source?.commit?.hash ?? '',
    }))
  }

  /** Raw unified diff for a PR (Bitbucket 302-redirects to the diff blob). */
  async diff(workspace: string, repo: string, id: number): Promise<string> {
    const res = await fetch(`${BASE}/repositories/${workspace}/${repo}/pullrequests/${id}/diff`, {
      headers: this.headers(),
    })
    if (!res.ok) throw new BitbucketError(res.status, `Bitbucket ${res.status} fetching diff`)
    return res.text()
  }

  /** Post a comment; pass `inline` for a file/line-anchored comment. */
  async postComment(
    workspace: string,
    repo: string,
    id: number,
    raw: string,
    inline?: { path: string; to: number },
  ): Promise<void> {
    const res = await fetch(
      `${BASE}/repositories/${workspace}/${repo}/pullrequests/${id}/comments`,
      {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ content: { raw }, ...(inline ? { inline } : {}) }),
      },
    )
    if (!res.ok) throw new BitbucketError(res.status, `Bitbucket ${res.status} posting comment`)
  }
}

/** Fan out across configured repos; a failing repo never blanks the dashboard. */
export async function syncPendingPrs(
  settings: Settings,
): Promise<{ prs: CachedPr[]; errors: string[] }> {
  const bb = new Bitbucket(settings.email, settings.apiToken)
  const results = await Promise.allSettled(
    settings.repos.map((repo) => bb.pendingPrs(settings.workspace, repo, settings.uuid)),
  )
  const prs: CachedPr[] = []
  const errors: string[] = []
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') prs.push(...res.value)
    else errors.push(`${settings.repos[i]}: ${res.reason instanceof Error ? res.reason.message : String(res.reason)}`)
  })
  return { prs, errors }
}
