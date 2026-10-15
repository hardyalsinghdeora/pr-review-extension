import { z } from 'zod'
import type { CachedPr } from '../types'
import type { PreparedDiff } from './diff'

export const FindingSchema = z.object({
  category: z.enum(['security', 'validation', 'performance', 'duplication', 'naming', 'logic']),
  severity: z.enum(['info', 'minor', 'major', 'critical']),
  file: z.string(),
  line: z.number().nullable(),
  explanation: z.string(),
  suggestedChange: z.string().nullable(),
})

export const ReviewSchema = z.object({
  summary: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  findings: z.array(FindingSchema),
})

export type ReviewOutput = z.infer<typeof ReviewSchema>

export const SUMMARY_SYSTEM = `You are a senior software engineer summarizing a pull request for a busy reviewer.
Given PR metadata and its diff, produce a concise summary: what the change does, how it is structured, the areas that deserve reviewer attention, and any immediate red flags.
Use short paragraphs and bullet points. If the diff is partial, mention which files you did not see.`

export const REVIEW_SYSTEM = `You are a rigorous senior code reviewer analyzing a pull request diff.
Report every issue you find, including ones you are uncertain about or consider low-severity. Do not filter for importance — the severity field conveys that, and a downstream step handles ranking. It is better to surface a finding that gets filtered out than to silently drop a real bug.
Categories: security, validation (missing input validation), performance, duplication, naming, logic (general correctness).
For findings tied to a specific changed line, set "file" to the new file path and "line" to the NEW-file line number derived from the hunk header. Use null for file-level or PR-level findings.
Set "suggestedChange" to concrete replacement code when applicable, otherwise null.
If the diff is partial, note that in the summary.`

export function userContent(pr: CachedPr, prepared: PreparedDiff): string {
  const omitted = prepared.omittedFiles.length
    ? `\n\nFiles omitted from this diff (noise or size budget): ${prepared.omittedFiles.join(', ')}`
    : ''
  return `Pull request: ${pr.workspace}/${pr.repo} #${pr.id}
Title: ${pr.title}
Author: ${pr.author}
Created: ${pr.createdOn}${omitted}

Diff:
\`\`\`diff
${prepared.text}
\`\`\``
}
