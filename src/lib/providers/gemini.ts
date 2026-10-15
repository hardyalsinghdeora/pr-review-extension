import type { Settings } from '../../types'
import { REVIEW_SYSTEM, SUMMARY_SYSTEM } from '../aiShared'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// Gemini's schema dialect (OpenAPI-style, uppercase types).
const GEMINI_REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    riskLevel: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    findings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          category: {
            type: 'STRING',
            enum: ['security', 'validation', 'performance', 'duplication', 'naming', 'logic'],
          },
          severity: { type: 'STRING', enum: ['info', 'minor', 'major', 'critical'] },
          file: { type: 'STRING' },
          line: { type: 'NUMBER', nullable: true },
          explanation: { type: 'STRING' },
          suggestedChange: { type: 'STRING', nullable: true },
        },
        required: ['category', 'severity', 'file', 'explanation'],
      },
    },
  },
  required: ['summary', 'riskLevel', 'findings'],
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  error?: { message?: string }
}

const NON_TEXT_MODEL = /embedding|image|imagen|veo|tts|audio|live/i

/**
 * Live model discovery — Google retires model IDs often enough that a
 * hardcoded list rots. Returns text-generation model ids, newest-first.
 */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${BASE}?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey },
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await errorMessage(res)}`)
  const data = (await res.json()) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
  }
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter((id) => id.startsWith('gemini') && !NON_TEXT_MODEL.test(id))
    .sort()
    .reverse()
}

function partsText(json: GeminiResponse): string {
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as GeminiResponse
    return body.error?.message ?? res.statusText
  } catch {
    return res.statusText
  }
}

function body(system: string, user: string, generationConfig?: object): string {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    ...(generationConfig ? { generationConfig } : {}),
  })
}

export async function summarize(
  s: Settings,
  user: string,
  onDelta?: (text: string) => void,
): Promise<string> {
  const res = await fetch(`${BASE}/${s.geminiModel}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey },
    body: body(SUMMARY_SYSTEM, user),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await errorMessage(res)}`)

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
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const text = partsText(JSON.parse(payload) as GeminiResponse)
        if (text) {
          out += text
          onDelta?.(text)
        }
      } catch {
        // partial JSON across chunks — the buffer handles line splits; skip bad lines
      }
    }
  }
  return out
}

export async function review(s: Settings, user: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${s.geminiModel}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey },
    body: body(REVIEW_SYSTEM, user, {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_REVIEW_SCHEMA,
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await errorMessage(res)}`)
  const text = partsText((await res.json()) as GeminiResponse)
  if (!text) throw new Error('Gemini returned an empty review response.')
  return JSON.parse(text) as unknown
}
