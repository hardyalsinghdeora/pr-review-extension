/**
 * Unified-diff preparation shared by the AI pipeline (chunking/budgeting).
 * The viewer parses the same raw text with react-diff-view's parseDiff.
 */

export interface FilePatch {
  path: string
  text: string
}

export interface PreparedDiff {
  text: string
  omittedFiles: string[]
  truncated: boolean
}

const NOISE_PATTERNS: RegExp[] = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)Gemfile\.lock$/,
  /(^|\/)go\.sum$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.snap$/,
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|jar|woff2?)$/i,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)node_modules\//,
]

/** Default character budget for the AI payload (~150k chars to start). */
export const DEFAULT_BUDGET = 150_000

export function splitByFile(raw: string): FilePatch[] {
  return raw
    .split(/^(?=diff --git )/m)
    .filter((part) => part.trim().length > 0)
    .map((text) => {
      const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(text)
      return { path: m ? m[2] : 'unknown', text }
    })
}

export function isNoise(path: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(path))
}

/**
 * Drop noise files, then fill the budget smallest-file-first (maximizes the
 * number of fully included files). Omitted files are reported by name so the
 * model knows the review is partial.
 */
export function prepareForAi(raw: string, budget = DEFAULT_BUDGET): PreparedDiff {
  const files = splitByFile(raw)
  const omittedFiles: string[] = []
  const kept: FilePatch[] = []
  for (const f of files) {
    if (isNoise(f.path)) omittedFiles.push(f.path)
    else kept.push(f)
  }

  kept.sort((a, b) => a.text.length - b.text.length)
  const chunks: string[] = []
  let total = 0
  let truncated = false
  for (const f of kept) {
    if (total + f.text.length > budget) {
      omittedFiles.push(f.path)
      truncated = true
      continue
    }
    chunks.push(f.text)
    total += f.text.length
  }

  return { text: chunks.join('\n'), omittedFiles, truncated }
}
