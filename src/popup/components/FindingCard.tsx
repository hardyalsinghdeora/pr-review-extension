import { useState } from 'react'
import type { Finding } from '../../types'

const SEVERITY_STYLES: Record<Finding['severity'], string> = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-orange-100 text-orange-800',
  minor: 'bg-yellow-100 text-yellow-800',
  info: 'bg-gray-100 text-gray-700',
}

export default function FindingCard({
  finding,
  compact = false,
  onPost,
}: {
  finding: Finding
  compact?: boolean
  /** Present only when comment-posting is allowed (Pro). */
  onPost?: (finding: Finding) => Promise<void>
}) {
  const [posting, setPosting] = useState(false)
  const [posted, setPosted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const post = async () => {
    if (!onPost) return
    setPosting(true)
    setError(null)
    try {
      await onPost(finding)
      setPosted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  return (
    <div
      className={`rounded border border-gray-200 bg-white p-2 text-xs ${
        compact ? 'my-1' : 'mb-2'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_STYLES[finding.severity]}`}
        >
          {finding.severity}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
          {finding.category}
        </span>
        <span className="truncate font-mono text-[10px] text-gray-500">
          {finding.file}
          {finding.line != null ? `:${finding.line}` : ''}
        </span>
        {onPost && !posted && (
          <button
            onClick={post}
            disabled={posting}
            className="ml-auto shrink-0 rounded border border-blue-300 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            {posting ? 'Posting…' : 'Post comment'}
          </button>
        )}
        {posted && <span className="ml-auto text-[10px] text-green-600">✓ posted</span>}
      </div>
      <p className="mt-1 text-gray-700">{finding.explanation}</p>
      {finding.suggestedChange && (
        <pre className="mt-1 overflow-x-auto rounded bg-gray-50 p-1.5 font-mono text-[10px] text-gray-800">
          {finding.suggestedChange}
        </pre>
      )}
      {error && <div className="mt-1 text-[10px] text-red-600">{error}</div>}
    </div>
  )
}
