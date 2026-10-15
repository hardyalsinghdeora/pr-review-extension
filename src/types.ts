export type SyncMode = 'scheduled' | 'manual'
export type Tier = 'free' | 'pro'
export type Provider = 'anthropic' | 'gemini' | 'ollama'

export interface Settings {
  email: string
  apiToken: string
  workspace: string
  repos: string[]
  /** Bitbucket account uuid (with braces), captured when the token is validated. */
  uuid: string
  provider: Provider
  anthropicKey: string
  model: string
  geminiKey: string
  geminiModel: string
  ollamaUrl: string
  ollamaModel: string
  syncMode: SyncMode
  pollMinutes: number
  staleThresholdHours: number
  autoReview: boolean
  /** Local time "HH:MM" for the daily digest. */
  digestTime: string
}

export interface CachedPr {
  workspace: string
  repo: string
  id: number
  title: string
  author: string
  link: string
  createdOn: string
  updatedOn: string
  commentCount: number
  approvedByMe: boolean
  sourceCommit: string
}

export interface PrCache {
  updatedAt: string | null
  prs: CachedPr[]
  errors: string[]
}

export type FindingCategory =
  | 'security'
  | 'validation'
  | 'performance'
  | 'duplication'
  | 'naming'
  | 'logic'

export type FindingSeverity = 'info' | 'minor' | 'major' | 'critical'

export interface Finding {
  category: FindingCategory
  severity: FindingSeverity
  file: string
  line: number | null
  explanation: string
  suggestedChange: string | null
}

export interface ReviewResult {
  summary: string
  riskLevel: 'low' | 'medium' | 'high'
  findings: Finding[]
  model: string
  createdAt: string
  sourceCommit: string
}

export interface SummaryEntry {
  text: string
  sourceCommit: string
  createdAt: string
}

export interface DigestEvent {
  type: 'assigned' | 'approved' | 'closed'
  at: string
  prKey: string
  title: string
}

export interface Entitlement {
  tier: Tier
  checkedAt: string | null
}

export interface AiUsage {
  month: string
  summaries: number
}

export function prKey(pr: Pick<CachedPr, 'workspace' | 'repo' | 'id'>): string {
  return `${pr.workspace}/${pr.repo}/${pr.id}`
}

export function isConfigured(s: Settings): boolean {
  return Boolean(s.email && s.apiToken && s.workspace && s.repos.length && s.uuid)
}

export function hoursSince(iso: string): number {
  return (Date.now() - Date.parse(iso)) / 3_600_000
}
