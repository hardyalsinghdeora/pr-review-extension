import { useMemo, useState, type ReactElement } from 'react'
import {
  Diff,
  Hunk,
  getChangeKey,
  markEdits,
  parseDiff,
  tokenize,
  type ChangeData,
  type FileData,
  type HunkData,
} from 'react-diff-view'
import type { Finding } from '../../types'
import FindingCard from './FindingCard'

/** Locate the change object for a NEW-file line number. */
function findChange(hunks: HunkData[], line: number): ChangeData | null {
  for (const hunk of hunks) {
    for (const change of hunk.changes) {
      if (change.type === 'insert' && change.lineNumber === line) return change
      if (change.type === 'normal' && change.newLineNumber === line) return change
    }
  }
  return null
}

function FileDiff({
  file,
  findings,
  split,
  onPost,
}: {
  file: FileData
  findings: Finding[]
  split: boolean
  onPost?: (finding: Finding) => Promise<void>
}) {
  const path = file.newPath || file.oldPath

  const tokens = useMemo(() => {
    try {
      return tokenize(file.hunks, {
        highlight: false,
        enhancers: [markEdits(file.hunks, { type: 'block' })],
      })
    } catch {
      return undefined
    }
  }, [file])

  const widgets = useMemo(() => {
    const map: Record<string, ReactElement> = {}
    for (const f of findings) {
      if (f.file !== path || f.line == null) continue
      const change = findChange(file.hunks, f.line)
      if (change) {
        map[getChangeKey(change)] = (
          <div className="px-3">
            <FindingCard finding={f} compact onPost={onPost} />
          </div>
        )
      }
    }
    return map
  }, [findings, file, path, onPost])

  return (
    <details open className="mb-2 rounded border border-gray-200 bg-white">
      <summary className="cursor-pointer select-none px-3 py-1.5 font-mono text-xs text-gray-700">
        {file.type === 'delete' ? `${file.oldPath} (deleted)` : path}
      </summary>
      <Diff
        viewType={split ? 'split' : 'unified'}
        diffType={file.type}
        hunks={file.hunks}
        tokens={tokens}
        widgets={widgets}
      >
        {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
      </Diff>
    </details>
  )
}

export default function DiffView({
  raw,
  findings,
  onPost,
}: {
  raw: string
  findings: Finding[]
  onPost?: (finding: Finding) => Promise<void>
}) {
  const [split, setSplit] = useState(false)

  const files = useMemo(() => {
    try {
      return parseDiff(raw)
    } catch {
      return [] as FileData[]
    }
  }, [raw])

  if (files.length === 0) {
    return <div className="text-xs text-gray-500">No parseable diff.</div>
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {files.length} file{files.length > 1 ? 's' : ''} changed
        </span>
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
          Side-by-side
        </label>
      </div>
      {files.map((file) => (
        <FileDiff
          key={`${file.oldPath}→${file.newPath}`}
          file={file}
          findings={findings}
          split={split}
          onPost={onPost}
        />
      ))}
    </div>
  )
}
