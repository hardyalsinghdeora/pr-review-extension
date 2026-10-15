import { useMemo, useState } from 'react'
import { hoursSince, type CachedPr, type PrCache } from '../../types'

type SortKey = 'priority' | 'created' | 'updated'

export function formatAge(iso: string): string {
  const h = hoursSince(iso)
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`
  if (h < 48) return `${Math.round(h)}h`
  return `${Math.round(h / 24)}d`
}

export default function Dashboard({
  cache,
  syncing,
  onRefresh,
  onOpen,
  staleThresholdHours,
}: {
  cache: PrCache | null
  syncing: boolean
  onRefresh: () => void
  onOpen: (pr: CachedPr) => void
  staleThresholdHours: number
}) {
  const prs = cache?.prs ?? []
  const [repo, setRepo] = useState('all')
  const [author, setAuthor] = useState('all')
  const [hideApproved, setHideApproved] = useState(false)
  const [sort, setSort] = useState<SortKey>('priority')

  const repos = useMemo(() => [...new Set(prs.map((p) => p.repo))].sort(), [prs])
  const authors = useMemo(() => [...new Set(prs.map((p) => p.author))].sort(), [prs])

  const visible = useMemo(() => {
    let list = prs
    if (repo !== 'all') list = list.filter((p) => p.repo === repo)
    if (author !== 'all') list = list.filter((p) => p.author === author)
    if (hideApproved) list = list.filter((p) => !p.approvedByMe)
    return [...list].sort((a, b) => {
      if (sort === 'created') return Date.parse(a.createdOn) - Date.parse(b.createdOn)
      if (sort === 'updated') return Date.parse(b.updatedOn) - Date.parse(a.updatedOn)
      // priority: unapproved first, then oldest first
      if (a.approvedByMe !== b.approvedByMe) return a.approvedByMe ? 1 : -1
      return Date.parse(a.createdOn) - Date.parse(b.createdOn)
    })
  }, [prs, repo, author, hideApproved, sort])

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <select
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="rounded border border-gray-300 bg-white px-1.5 py-1"
        >
          <option value="all">All repos</option>
          {repos.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="rounded border border-gray-300 bg-white px-1.5 py-1"
        >
          <option value="all">All authors</option>
          {authors.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded border border-gray-300 bg-white px-1.5 py-1"
        >
          <option value="priority">Priority</option>
          <option value="created">Oldest</option>
          <option value="updated">Recently updated</option>
        </select>
        <label className="flex items-center gap-1 text-gray-600">
          <input
            type="checkbox"
            checked={hideApproved}
            onChange={(e) => setHideApproved(e.target.checked)}
          />
          Hide approved
        </label>
        <button
          onClick={onRefresh}
          disabled={syncing}
          className="ml-auto rounded bg-blue-600 px-3 py-1 font-medium text-white disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

      {cache?.errors?.length ? (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          {cache.errors.join(' · ')}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-xs text-gray-500">
          {prs.length === 0
            ? 'No pending pull requests. Hit Refresh to sync.'
            : 'Nothing matches the current filters.'}
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {visible.map((pr) => {
            const stale = !pr.approvedByMe && hoursSince(pr.createdOn) > staleThresholdHours
            return (
              <li
                key={`${pr.workspace}/${pr.repo}/${pr.id}`}
                onClick={() => onOpen(pr)}
                className="cursor-pointer px-3 py-2 hover:bg-blue-50"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-800">
                    {pr.title}
                  </span>
                  {pr.approvedByMe && (
                    <span className="shrink-0 text-[10px] text-green-600">✓ approved</span>
                  )}
                  {stale && (
                    <span className="shrink-0 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">
                      stale
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex gap-3 text-[11px] text-gray-500">
                  <span>
                    {pr.repo} #{pr.id}
                  </span>
                  <span>{pr.author}</span>
                  <span>opened {formatAge(pr.createdOn)} ago</span>
                  <span>💬 {pr.commentCount}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {cache?.updatedAt && (
        <div className="mt-2 text-right text-[10px] text-gray-400">
          Last synced {formatAge(cache.updatedAt)} ago
        </div>
      )}
    </div>
  )
}
