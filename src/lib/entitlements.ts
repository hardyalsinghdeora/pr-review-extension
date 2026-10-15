import type { Tier } from '../types'
import { load, save } from './storage'

export type Feature =
  | 'scheduledSync'
  | 'fullReview'
  | 'autoReview'
  | 'digest'
  | 'postComments'

export const FREE_LIMITS = {
  repos: 3,
  summariesPerMonth: 10,
} as const

/**
 * Milestone 6 replaces this with ExtensionPay validation + a 7-day offline
 * grace period. Until then the tier is read straight from storage and the
 * dev default is Pro (see storage.ts defaults).
 */
export async function getTier(): Promise<Tier> {
  return (await load('entitlement')).tier
}

export async function setTier(tier: Tier): Promise<void> {
  await save('entitlement', { tier, checkedAt: new Date().toISOString() })
}

export async function can(_feature: Feature): Promise<boolean> {
  // Every gated feature is Pro-only in v1; the split lives in the matrix.
  return (await getTier()) === 'pro'
}

export async function repoLimit(): Promise<number> {
  return (await getTier()) === 'pro' ? Number.POSITIVE_INFINITY : FREE_LIMITS.repos
}

/**
 * Free-tier summary quota (soft enforcement, tracked per calendar month).
 * Returns false when the quota is exhausted; Pro always passes.
 */
export async function trySpendSummary(): Promise<boolean> {
  if ((await getTier()) === 'pro') return true
  const month = new Date().toISOString().slice(0, 7)
  const usage = await load('aiUsage')
  const used = usage.month === month ? usage.summaries : 0
  if (used >= FREE_LIMITS.summariesPerMonth) return false
  await save('aiUsage', { month, summaries: used + 1 })
  return true
}

export async function summariesLeft(): Promise<number> {
  if ((await getTier()) === 'pro') return Number.POSITIVE_INFINITY
  const month = new Date().toISOString().slice(0, 7)
  const usage = await load('aiUsage')
  const used = usage.month === month ? usage.summaries : 0
  return Math.max(0, FREE_LIMITS.summariesPerMonth - used)
}
