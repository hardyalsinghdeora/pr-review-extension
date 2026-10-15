import { z } from 'zod'
import type { Settings } from '../../types'
import { ReviewSchema, REVIEW_SYSTEM, SUMMARY_SYSTEM } from '../aiShared'

function url(s: Settings): string {
  return `${s.ollamaUrl.replace(/\/$/, '')}/api/chat`
}

function connectionHint(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/failed to fetch|networkerror/i.test(msg)) {
    return new Error(
      `Cannot reach Ollama at the configured URL. Make sure it is running and allows extension origins:\n` +
        `OLLAMA_ORIGINS="chrome-extension://*" ollama serve`,
    )
  }
  return e instanceof Error ? e : new Error(msg)
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return
  let detail = res.statusText
  try {
    detail = ((await res.json()) as { error?: string }).error ?? detail
  } catch {
    /* keep statusText */
  }
  throw new Error(`Ollama ${res.status}: ${detail}`)
}

export async function summarize(
  s: Settings,
  user: string,
  onDelta?: (text: string) => void,
): Promise<string> {
  let res: Response
  try {
    res = await fetch(url(s), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: s.ollamaModel,
        stream: true,
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM },
          { role: 'user', content: user },
        ],
      }),
    })
  } catch (e) {
    throw connectionHint(e)
  }
  await ensureOk(res)

  // Ollama streams NDJSON: one {"message":{"content":"…"},"done":false} per line.
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const chunk = JSON.parse(line) as { message?: { content?: string } }
        const text = chunk.message?.content ?? ''
        if (text) {
          out += text
          onDelta?.(text)
        }
      } catch {
        // skip malformed line
      }
    }
  }
  return out
}

export async function review(s: Settings, user: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url(s), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: s.ollamaModel,
        stream: false,
        // Ollama structured outputs take a standard JSON schema in `format`.
        format: z.toJSONSchema(ReviewSchema),
        messages: [
          { role: 'system', content: REVIEW_SYSTEM },
          { role: 'user', content: user },
        ],
      }),
    })
  } catch (e) {
    throw connectionHint(e)
  }
  await ensureOk(res)
  const data = (await res.json()) as { message?: { content?: string } }
  const text = data.message?.content
  if (!text) throw new Error('Ollama returned an empty review response.')
  return JSON.parse(text) as unknown
}
