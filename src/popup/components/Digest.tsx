import { useEffect, useState } from 'react'
import { load } from '../../lib/storage'
import { hoursSince, type DigestEvent, type PrCache } from '../../types'
import { formatAge } from './Dashboard'

export default function Digest({
  cache,
  staleThresholdHours,
}: {
  cache: PrCache | null
  staleThresholdHours: number
}) {
  const [events, setEvents] = useState<DigestEvent[]>([])

  useEffect(() => {
    void load('digestEvents').then(setEvents)
  }, [])

  const prs = cache?.prs ?? []
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const reviewedToday = events.filter(
    (e) => e.type === 'approved' && Date.parse(e.at) >= startOfDay.getTime(),
  )
  const assignedToday = events.filter(
    (e) => e.type === 'assigned' && Date.parse(e.at) >= startOfDay.getTime(),
  )
  const avgWaitH = prs.length
    ? Math.round(prs.reduce((acc, p) => acc + hoursSince(p.createdOn), 0) / prs.length)
    : 0
  const critical = prs
    .filter((p) => !p.approvedByMe && hoursSince(p.createdOn) > staleThresholdHours)
    .sort((a, b) => Date.parse(a.createdOn) - Date.parse(b.createdOn))

  const stats = [
    { label: 'Reviewed today', value: reviewedToday.length },
    { label: 'Assigned today', value: assignedToday.length },
    { label: 'Pending', value: prs.length },
    { label: 'Avg waiting', value: `${avgWaitH}h` },
  ]

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded border border-gray-200 bg-white p-3 text-center">
            <div className="text-lg font-semibold text-gray-800">{s.value}</div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      <section className="rounded border border-gray-200 bg-white p-3">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Critical (waiting &gt; {staleThresholdHours}h)
        </h2>
        {critical.length === 0 ? (
          <div className="text-xs text-gray-500">Nothing critical. 🎉</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {critical.map((pr) => (
              <li key={`${pr.repo}/${pr.id}`} className="py-1.5 text-xs">
                <a
                  href={pr.link}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-700 hover:underline"
                >
                  {pr.repo} #{pr.id}: {pr.title}
                </a>
                <span className="ml-2 text-gray-500">
                  waiting {formatAge(pr.createdOn)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded border border-gray-200 bg-white p-3">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Today's activity
        </h2>
        {reviewedToday.length + assignedToday.length === 0 ? (
          <div className="text-xs text-gray-500">No recorded activity yet today.</div>
        ) : (
          <ul className="space-y-1 text-xs text-gray-700">
            {[...assignedToday, ...reviewedToday]
              .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
              .map((e, i) => (
                <li key={i}>
                  <span className={e.type === 'approved' ? 'text-green-600' : 'text-blue-600'}>
                    {e.type === 'approved' ? '✓ approved' : '+ assigned'}
                  </span>{' '}
                  {e.title}
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  )
}
