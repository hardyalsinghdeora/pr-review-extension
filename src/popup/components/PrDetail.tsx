import { useEffect, useState } from 'react'
import { aiReady, aiSetupHint, fullReview, streamSummary } from '../../lib/ai'
import { Bitbucket } from '../../lib/bitbucket'
import { trySpendSummary } from '../../lib/entitlements'
import { load, save } from '../../lib/storage'
import {
  prKey,
  type CachedPr,
  type Finding,
  type ReviewResult,
  type Settings,
  type Tier,
} from '../../types'
import { UpgradePrompt } from '../App'
import DiffView from './DiffView'
import FindingCard from './FindingCard'

type RunState = 'idle' | 'running' | 'done' | 'error'

export default function PrDetail({
  pr,
  settings,
  tier,
  onBack,
}: {
  pr: CachedPr
  settings: Settings
  tier: Tier
  onBack: () => void
}) {
  const key = prKey(pr)
  const bb = new Bitbucket(settings.email, settings.apiToken)

  const [rawDiff, setRawDiff] = useState<string | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [summary, setSummary] = useState('')
  const [summaryState, setSummaryState] = useState<RunState>('idle')
  const [review, setReview] = useState<ReviewResult | null>(null)
  const [reviewState, setReviewState] = useState<RunState>('idle')
  const [aiError, setAiError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      // Cached AI results (valid while the source commit is unchanged).
      const summaries = await load('summaries')
      const cachedSummary = summaries[key]
      if (cachedSummary && cachedSummary.sourceCommit === pr.sourceCommit) {
        setSummary(cachedSummary.text)
        setSummaryState('done')
      }
      const reviews = await load('reviews')
      const cachedReview = reviews[key]
      if (cachedReview && cachedReview.sourceCommit === pr.sourceCommit) {
        setReview(cachedReview)
        setReviewState('done')
      }
      try {
        setRawDiff(await bb.diff(pr.workspace, pr.repo, pr.id))
      } catch (e) {
        setDiffError(e instanceof Error ? e.message : String(e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const needsKey = !aiReady(settings)

  const runSummary = async () => {
    if (needsKey || !rawDiff) return
    if (!(await trySpendSummary())) {
      setAiError('Free-tier summary quota reached for this month. Upgrade to Pro for unlimited summaries.')
      return
    }
    setAiError(null)
    setSummary('')
    setSummaryState('running')
    try {
      const text = await streamSummary(settings, pr, rawDiff, (delta) =>
        setSummary((prev) => prev + delta),
      )
      setSummary(text)
      setSummaryState('done')
      const summaries = await load('summaries')
      summaries[key] = { text, sourceCommit: pr.sourceCommit, createdAt: new Date().toISOString() }
      await save('summaries', summaries)
    } catch (e) {
      setSummaryState('error')
      setAiError(e instanceof Error ? e.message : String(e))
    }
  }

  const runReview = async () => {
    if (needsKey || !rawDiff || tier !== 'pro') return
    setAiError(null)
    setReviewState('running')
    try {
      const result = await fullReview(settings, pr, rawDiff)
      setReview(result)
      setReviewState('done')
      const reviews = await load('reviews')
      reviews[key] = result
      await save('reviews', reviews)
    } catch (e) {
      setReviewState('error')
      setAiError(e instanceof Error ? e.message : String(e))
    }
  }

  const postFinding = async (f: Finding) => {
    const body = `**[AI review — ${f.severity} · ${f.category}]** ${f.explanation}${
      f.suggestedChange ? `\n\n\`\`\`suggestion\n${f.suggestedChange}\n\`\`\`` : ''
    }`
    await bb.postComment(
      pr.workspace,
      pr.repo,
      pr.id,
      body,
      f.line != null ? { path: f.file, to: f.line } : undefined,
    )
  }

  const postSummaryComment = async () => {
    if (!review) return
    await bb.postComment(
      pr.workspace,
      pr.repo,
      pr.id,
      `**AI review summary** (risk: ${review.riskLevel})\n\n${review.summary}`,
    )
  }

  const canPost = tier === 'pro'
  const findings = review?.findings ?? []

  return (
    <div className="min-h-[540px] bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-xs text-blue-600 hover:underline">
            ← Back
          </button>
          <span className="truncate text-sm font-semibold text-gray-800">{pr.title}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-gray-500">
          <span>
            {pr.workspace}/{pr.repo} #{pr.id}
          </span>
          <span>{pr.author}</span>
          <a href={pr.link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            Open in Bitbucket ↗
          </a>
          <button
            onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/index.html') })}
            className="text-blue-600 hover:underline"
          >
            Open extension in tab
          </button>
        </div>
      </header>

      <div className="space-y-3 p-3">
        <div className="flex gap-2">
          <button
            onClick={runSummary}
            disabled={needsKey || !rawDiff || summaryState === 'running'}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {summaryState === 'running' ? 'Summarizing…' : summary ? 'Re-run summary' : 'AI summary'}
          </button>
          <button
            onClick={runReview}
            disabled={needsKey || !rawDiff || reviewState === 'running' || tier !== 'pro'}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            title={tier !== 'pro' ? 'Full review is a Pro feature' : undefined}
          >
            {reviewState === 'running'
              ? 'Reviewing…'
              : `Full review${tier !== 'pro' ? ' 🔒' : ''}`}
          </button>
          {review && canPost && (
            <button
              onClick={postSummaryComment}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
            >
              Post summary to PR
            </button>
          )}
        </div>

        {needsKey && (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {aiSetupHint(settings)}
          </div>
        )}
        {aiError && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
            {aiError}
          </div>
        )}

        {(summary || summaryState === 'running') && (
          <section className="rounded border border-gray-200 bg-white p-3">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              AI summary
            </h2>
            <div className="text-xs whitespace-pre-wrap text-gray-800">
              {summary || 'Thinking…'}
            </div>
          </section>
        )}

        {review && (
          <section className="rounded border border-gray-200 bg-white p-3">
            <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Full review
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  review.riskLevel === 'high'
                    ? 'bg-red-100 text-red-700'
                    : review.riskLevel === 'medium'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-green-100 text-green-700'
                }`}
              >
                risk: {review.riskLevel}
              </span>
              <span className="font-normal normal-case text-gray-400">
                {findings.length} finding{findings.length === 1 ? '' : 's'}
              </span>
            </h2>
            <p className="mb-2 text-xs whitespace-pre-wrap text-gray-800">{review.summary}</p>
            {findings.map((f, i) => (
              <FindingCard key={i} finding={f} onPost={canPost ? postFinding : undefined} />
            ))}
          </section>
        )}

        {tier !== 'pro' && reviewState === 'idle' && !review && (
          <UpgradePrompt feature="Full structured review" />
        )}

        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Diff
          </h2>
          {diffError ? (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
              Failed to load diff: {diffError}
            </div>
          ) : rawDiff === null ? (
            <div className="text-xs text-gray-500">Loading diff…</div>
          ) : (
            <DiffView raw={rawDiff} findings={findings} onPost={canPost ? postFinding : undefined} />
          )}
        </section>
      </div>
    </div>
  )
}
