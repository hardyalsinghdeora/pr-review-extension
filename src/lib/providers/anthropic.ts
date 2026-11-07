import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { Settings } from '../../types'
import { ReviewSchema, REVIEW_SYSTEM, SUMMARY_SYSTEM } from '../aiShared'

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

/**
 * Adaptive thinking is only accepted on Claude 4.6+ models. Haiku 4.5 (the
 * "fastest" option) supports only budget-based thinking, so it runs without
 * thinking rather than receiving a config it rejects.
 */
const NO_ADAPTIVE_THINKING = ['claude-haiku-4-5']

function thinkingFor(model: string): { thinking?: Anthropic.ThinkingConfigParam } {
  return NO_ADAPTIVE_THINKING.some((prefix) => model.startsWith(prefix))
    ? {}
    : { thinking: { type: 'adaptive' } }
}

export async function summarize(
  s: Settings,
  user: string,
  onDelta?: (text: string) => void,
): Promise<string> {
  const stream = client(s.anthropicKey).messages.stream({
    model: s.model,
    max_tokens: 16000,
    ...thinkingFor(s.model),
    system: SUMMARY_SYSTEM,
    messages: [{ role: 'user', content: user }],
  })
  if (onDelta) stream.on('text', onDelta)
  const final = await stream.finalMessage()
  return final.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

export async function review(s: Settings, user: string): Promise<unknown> {
  const response = await client(s.anthropicKey).messages.parse({
    model: s.model,
    max_tokens: 16000,
    ...thinkingFor(s.model),
    system: REVIEW_SYSTEM,
    messages: [{ role: 'user', content: user }],
    output_config: { format: zodOutputFormat(ReviewSchema) },
  })
  if (!response.parsed_output) throw new Error('The model returned no parseable review output.')
  return response.parsed_output
}
