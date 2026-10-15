import type {
  AiUsage,
  DigestEvent,
  Entitlement,
  PrCache,
  ReviewResult,
  Settings,
  SummaryEntry,
} from '../types'

export interface Schema {
  settings: Settings
  prCache: PrCache
  summaries: Record<string, SummaryEntry>
  reviews: Record<string, ReviewResult>
  digestEvents: DigestEvent[]
  entitlement: Entitlement
  aiUsage: AiUsage
  notifUrls: Record<string, string>
  meta: { lastStaleNoticeAt: string | null }
}

export const DEFAULT_SETTINGS: Settings = {
  email: '',
  apiToken: '',
  workspace: '',
  repos: [],
  uuid: '',
  provider: 'anthropic',
  anthropicKey: '',
  model: 'claude-opus-4-8',
  geminiKey: '',
  geminiModel: 'gemini-3.5-flash',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5-coder',
  syncMode: 'scheduled',
  pollMinutes: 15,
  staleThresholdHours: 24,
  autoReview: false,
  digestTime: '09:00',
}

const defaults: Schema = {
  settings: DEFAULT_SETTINGS,
  prCache: { updatedAt: null, prs: [], errors: [] },
  summaries: {},
  reviews: {},
  digestEvents: [],
  // Dev default is Pro (milestone 6 swaps this for an ExtensionPay check).
  entitlement: { tier: 'pro', checkedAt: null },
  aiUsage: { month: '', summaries: 0 },
  notifUrls: {},
  meta: { lastStaleNoticeAt: null },
}

export async function load<K extends keyof Schema>(key: K): Promise<Schema[K]> {
  const res = await chrome.storage.local.get(key)
  const value = res[key] as Schema[K] | undefined
  if (value === undefined) return structuredClone(defaults[key])
  if (key === 'settings') {
    // Merge so new settings fields get defaults after an upgrade.
    return { ...structuredClone(defaults.settings), ...(value as object) } as Schema[K]
  }
  return value
}

export async function save<K extends keyof Schema>(key: K, value: Schema[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value })
}
