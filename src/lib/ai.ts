import type { CachedPr, Provider, ReviewResult, Settings } from '../types'
import { ReviewSchema, userContent } from './aiShared'
import { prepareForAi } from './diff'
import * as anthropic from './providers/anthropic'
import * as gemini from './providers/gemini'
import * as ollama from './providers/ollama'

export const MODEL_OPTIONS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (default)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (cheaper)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest)' },
] as const

// Fallback only — the Settings "Load" button fetches the live list from
// Google's ListModels API, since Google retires model ids frequently.
export const GEMINI_MODELS = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (free tier)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (free tier)' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
] as const

export const PROVIDER_OPTIONS: Array<{ id: Provider; label: string; hint: string }> = [
  {
    id: 'anthropic',
    label: 'Anthropic Claude (paid, best quality)',
    hint: 'Pay-per-use key from console.anthropic.com. A summary costs cents.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (free tier)',
    hint: 'Free API key from aistudio.google.com — no card required.',
  },
  {
    id: 'ollama',
    label: 'Ollama (free, runs locally)',
    hint: 'No key. Requires: OLLAMA_ORIGINS="chrome-extension://*" ollama serve',
  },
]

interface Adapter {
  summarize(s: Settings, user: string, onDelta?: (t: string) => void): Promise<string>
  review(s: Settings, user: string): Promise<unknown>
}

const adapters: Record<Provider, Adapter> = { anthropic, gemini, ollama }

/** Whether the configured provider has what it needs to run. */
export function aiReady(s: Settings): boolean {
  if (s.provider === 'anthropic') return Boolean(s.anthropicKey)
  if (s.provider === 'gemini') return Boolean(s.geminiKey)
  return Boolean(s.ollamaUrl && s.ollamaModel)
}

export function aiSetupHint(s: Settings): string {
  if (s.provider === 'anthropic')
    return 'Add your Anthropic API key in Settings to enable AI features.'
  if (s.provider === 'gemini')
    return 'Add your Gemini API key in Settings (free at aistudio.google.com) to enable AI features.'
  return 'Set the Ollama URL and model in Settings to enable AI features.'
}

export function activeModel(s: Settings): string {
  if (s.provider === 'anthropic') return s.model
  if (s.provider === 'gemini') return s.geminiModel
  return s.ollamaModel
}

/** Streamed PR summary; onDelta receives text chunks as they arrive. */
export async function streamSummary(
  s: Settings,
  pr: CachedPr,
  rawDiff: string,
  onDelta?: (text: string) => void,
): Promise<string> {
  const prepared = prepareForAi(rawDiff)
  return adapters[s.provider].summarize(s, userContent(pr, prepared), onDelta)
}

/**
 * Non-schema-native providers (and weak local models) may omit nullable
 * fields — fill them in before validating.
 */
function normalizeReview(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.findings)) return raw
  return {
    ...obj,
    findings: obj.findings.map((f) =>
      typeof f === 'object' && f !== null
        ? { line: null, suggestedChange: null, ...(f as object) }
        : f,
    ),
  }
}

/** Full structured review — validated against the shared schema. */
export async function fullReview(
  s: Settings,
  pr: CachedPr,
  rawDiff: string,
): Promise<ReviewResult> {
  const prepared = prepareForAi(rawDiff)
  const raw = await adapters[s.provider].review(s, userContent(pr, prepared))
  const parsed = ReviewSchema.safeParse(normalizeReview(raw))
  if (!parsed.success) {
    throw new Error(
      `The ${s.provider} model returned a review that does not match the expected format. Try again or switch models.`,
    )
  }
  return {
    ...parsed.data,
    model: activeModel(s),
    createdAt: new Date().toISOString(),
    sourceCommit: pr.sourceCommit,
  }
}
