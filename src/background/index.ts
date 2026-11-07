import { aiReady, streamSummary } from '../lib/ai'
import { Bitbucket, syncPendingPrs } from '../lib/bitbucket'
import { can } from '../lib/entitlements'
import { load, save } from '../lib/storage'
import {
  hoursSince,
  isConfigured,
  prKey,
  type CachedPr,
  type PrCache,
  type Settings,
} from '../types'

// ---------------------------------------------------------------------------
// Alarms — all scheduling goes through chrome.alarms; the worker holds no
// in-memory timers (MV3 kills it after ~30s idle).
// ---------------------------------------------------------------------------

function nextDigestTime(hhmm: string): number {
  const [h = 9, m = 0] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
  return d.getTime()
}

async function registerAlarms(): Promise<void> {
  await chrome.alarms.clear('poll')
  await chrome.alarms.clear('digest')
  const s = await load('settings')
  if (s.syncMode === 'scheduled' && (await can('scheduledSync'))) {
    chrome.alarms.create('poll', { periodInMinutes: Math.max(1, s.pollMinutes) })
  }
  if (await can('digest')) {
    chrome.alarms.create('digest', {
      when: nextDigestTime(s.digestTime),
      periodInMinutes: 24 * 60,
    })
  }
}

chrome.runtime.onInstalled.addListener(() => void registerAlarms())
chrome.runtime.onStartup.addListener(() => void registerAlarms())

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'poll') void sync({ notify: true })
  if (alarm.name === 'digest') void sendDigest()
})

// ---------------------------------------------------------------------------
// Messages from the popup — sync logic lives in one place (here).
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg: { type?: string }, sender, sendResponse) => {
  // Only accept messages from this extension's own pages (e.g. the popup).
  if (sender.id !== chrome.runtime.id) return undefined
  if (msg?.type === 'sync') {
    sync({ notify: false })
      .then(sendResponse)
      .catch((e) => sendResponse({ updatedAt: null, prs: [], errors: [String(e)] }))
    return true
  }
  if (msg?.type === 'registerAlarms') {
    registerAlarms()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }
  return undefined
})

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

async function sync({ notify }: { notify: boolean }): Promise<PrCache> {
  const s = await load('settings')
  if (!isConfigured(s)) {
    return { updatedAt: null, prs: [], errors: ['Extension is not configured yet.'] }
  }

  const { prs, errors } = await syncPendingPrs(s)
  const prev = await load('prCache')
  const cache: PrCache = { updatedAt: new Date().toISOString(), prs, errors }
  await save('prCache', cache)

  await recordDigestEvents(prev.prs, prs)
  await updateBadge(prs)
  if (notify) await notifyChanges(prev.prs, prs, s)
  void autoReview(s, prs)
  return cache
}

async function updateBadge(prs: CachedPr[]): Promise<void> {
  const waiting = prs.filter((p) => !p.approvedByMe).length
  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' })
  await chrome.action.setBadgeText({ text: waiting > 0 ? String(waiting) : '' })
}

// ---------------------------------------------------------------------------
// Digest event log — transitions recorded on every poll, trimmed to 30 days.
// ---------------------------------------------------------------------------

async function recordDigestEvents(oldPrs: CachedPr[], newPrs: CachedPr[]): Promise<void> {
  const events = await load('digestEvents')
  const now = new Date().toISOString()
  const oldMap = new Map(oldPrs.map((p) => [prKey(p), p]))
  const newMap = new Map(newPrs.map((p) => [prKey(p), p]))

  for (const [key, pr] of newMap) {
    const prev = oldMap.get(key)
    if (!prev) events.push({ type: 'assigned', at: now, prKey: key, title: pr.title })
    else if (!prev.approvedByMe && pr.approvedByMe)
      events.push({ type: 'approved', at: now, prKey: key, title: pr.title })
  }
  for (const [key, pr] of oldMap) {
    if (!newMap.has(key)) events.push({ type: 'closed', at: now, prKey: key, title: pr.title })
  }

  const cutoff = Date.now() - 30 * 86_400_000
  await save(
    'digestEvents',
    events.filter((e) => Date.parse(e.at) >= cutoff),
  )
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function notifyChanges(
  oldPrs: CachedPr[],
  newPrs: CachedPr[],
  s: Settings,
): Promise<void> {
  const notifUrls = await load('notifUrls')
  const oldKeys = new Set(oldPrs.map(prKey))
  const fresh = newPrs.filter((p) => !oldKeys.has(prKey(p)))

  for (const pr of fresh.slice(0, 5)) {
    const id = `pr:${prKey(pr)}:${Date.now()}`
    notifUrls[id] = pr.link
    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon128.png'),
      title: 'New PR to review',
      message: `${pr.repo} #${pr.id}: ${pr.title}`,
    })
  }

  // Stale reminder — throttled to once per 24h so a 15-min poll doesn't spam.
  const meta = await load('meta')
  const throttled =
    meta.lastStaleNoticeAt !== null && hoursSince(meta.lastStaleNoticeAt) < 24
  const stale = newPrs
    .filter((p) => !p.approvedByMe && hoursSince(p.createdOn) > s.staleThresholdHours)
    .sort((a, b) => Date.parse(a.createdOn) - Date.parse(b.createdOn))

  if (stale.length > 0 && !throttled) {
    const oldest = stale[0]
    const id = `stale:${Date.now()}`
    notifUrls[id] = oldest.link
    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon128.png'),
      title: `${stale.length} PR${stale.length > 1 ? 's' : ''} waiting on you`,
      message: `Oldest: ${oldest.repo} #${oldest.id} — ${oldest.title}`,
    })
    await save('meta', { lastStaleNoticeAt: new Date().toISOString() })
  }

  await save('notifUrls', notifUrls)
}

chrome.notifications.onClicked.addListener((id) => {
  void (async () => {
    const map = await load('notifUrls')
    const url = map[id]
    if (url) {
      await chrome.tabs.create({ url })
      delete map[id]
      await save('notifUrls', map)
    }
    chrome.notifications.clear(id)
  })()
})

// ---------------------------------------------------------------------------
// Daily digest (Pro)
// ---------------------------------------------------------------------------

async function sendDigest(): Promise<void> {
  if (!(await can('digest'))) return
  const cache = await load('prCache')
  const events = await load('digestEvents')
  const s = await load('settings')

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const reviewedToday = events.filter(
    (e) => e.type === 'approved' && Date.parse(e.at) >= startOfDay.getTime(),
  ).length
  const pending = cache.prs.length
  const avgWaitH = pending
    ? Math.round(cache.prs.reduce((acc, p) => acc + hoursSince(p.createdOn), 0) / pending)
    : 0
  const critical = cache.prs.filter(
    (p) => !p.approvedByMe && hoursSince(p.createdOn) > s.staleThresholdHours,
  ).length

  chrome.notifications.create(`digest:${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon128.png'),
    title: 'Daily PR review digest',
    message: `Pending: ${pending} · Reviewed today: ${reviewedToday} · Avg wait: ${avgWaitH}h · Critical: ${critical}`,
  })
}

// ---------------------------------------------------------------------------
// Auto-review on schedule (Pro, off by default) — summaries only, bounded by
// the per-source-commit cache and capped per poll.
// ---------------------------------------------------------------------------

const AUTO_REVIEW_CAP_PER_POLL = 3

async function autoReview(s: Settings, prs: CachedPr[]): Promise<void> {
  if (!s.autoReview || !aiReady(s)) return
  if (s.syncMode !== 'scheduled') return
  if (!(await can('autoReview'))) return

  const summaries = await load('summaries')
  const bb = new Bitbucket(s.email, s.apiToken)
  const candidates = prs
    .filter((p) => p.sourceCommit && summaries[prKey(p)]?.sourceCommit !== p.sourceCommit)
    .slice(0, AUTO_REVIEW_CAP_PER_POLL)

  for (const pr of candidates) {
    try {
      const rawDiff = await bb.diff(pr.workspace, pr.repo, pr.id)
      const text = await streamSummary(s, pr, rawDiff)
      const latest = await load('summaries')
      latest[prKey(pr)] = {
        text,
        sourceCommit: pr.sourceCommit,
        createdAt: new Date().toISOString(),
      }
      await save('summaries', latest)
    } catch (e) {
      console.warn('auto-review failed for', prKey(pr), e)
    }
  }
}
