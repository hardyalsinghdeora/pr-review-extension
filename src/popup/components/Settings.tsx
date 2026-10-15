import { useState } from 'react'
import { GEMINI_MODELS, MODEL_OPTIONS, PROVIDER_OPTIONS } from '../../lib/ai'
import { listGeminiModels } from '../../lib/providers/gemini'
import { Bitbucket } from '../../lib/bitbucket'
import { FREE_LIMITS, setTier } from '../../lib/entitlements'
import { save } from '../../lib/storage'
import type { Provider, Settings, SyncMode, Tier } from '../../types'

export default function SettingsView({
  settings,
  tier,
  onSaved,
}: {
  settings: Settings
  tier: Tier
  onSaved: (s: Settings, t: Tier) => void
}) {
  const [form, setForm] = useState<Settings>(settings)
  const [devTier, setDevTier] = useState<Tier>(tier)
  const [repoText, setRepoText] = useState(settings.repos.join(', '))
  const [repoOptions, setRepoOptions] = useState<string[] | null>(null)
  const [geminiModels, setGeminiModels] = useState<string[] | null>(null)
  const [busy, setBusy] = useState<'save' | 'repos' | 'gemini' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const isPro = devTier === 'pro'

  const loadRepos = async () => {
    setBusy('repos')
    setError(null)
    try {
      const bb = new Bitbucket(form.email, form.apiToken)
      setRepoOptions(await bb.workspaceRepos(form.workspace))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const loadModels = async () => {
    setBusy('gemini')
    setError(null)
    try {
      const models = await listGeminiModels(form.geminiKey)
      if (models.length === 0) throw new Error('No text-generation models returned for this key.')
      setGeminiModels(models)
      if (!models.includes(form.geminiModel)) set('geminiModel', models[0])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const saveAll = async () => {
    setBusy('save')
    setError(null)
    try {
      let repos = repoText
        .split(/[,\n]/)
        .map((r) => r.trim())
        .filter(Boolean)
      if (!isPro && repos.length > FREE_LIMITS.repos) {
        setError(
          `The Free tier supports up to ${FREE_LIMITS.repos} repositories — remove ${repos.length - FREE_LIMITS.repos} or upgrade to Pro.`,
        )
        setBusy(null)
        return
      }
      // Validate credentials and capture the reviewer uuid.
      const bb = new Bitbucket(form.email, form.apiToken)
      const me = await bb.me()

      const next: Settings = {
        ...form,
        repos,
        uuid: me.uuid,
        syncMode: isPro ? form.syncMode : 'manual',
      }
      await save('settings', next)
      await setTier(devTier)
      await chrome.runtime.sendMessage({ type: 'registerAlarms' })
      onSaved(next, devTier)
    } catch (e) {
      setError(
        e instanceof Error
          ? `Validation failed — check email/token: ${e.message}`
          : String(e),
      )
    } finally {
      setBusy(null)
    }
  }

  const field = 'w-full rounded border border-gray-300 px-2 py-1 text-xs'
  const label = 'mb-0.5 block text-[11px] font-medium text-gray-600'

  return (
    <div className="space-y-4 p-4">
      <section className="rounded border border-gray-200 bg-white p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Bitbucket
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Atlassian email</label>
            <input
              className={field}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className={label}>API token</label>
            <input
              className={field}
              type="password"
              value={form.apiToken}
              onChange={(e) => set('apiToken', e.target.value)}
              placeholder="Atlassian API token"
            />
          </div>
          <div>
            <label className={label}>Workspace</label>
            <input
              className={field}
              value={form.workspace}
              onChange={(e) => set('workspace', e.target.value)}
              placeholder="workspace-slug"
            />
          </div>
          <div>
            <label className={label}>
              Repositories {!isPro && `(max ${FREE_LIMITS.repos} on Free)`}
            </label>
            <div className="flex gap-1">
              <input
                className={field}
                value={repoText}
                onChange={(e) => setRepoText(e.target.value)}
                placeholder="repo-a, repo-b"
              />
              <button
                onClick={loadRepos}
                disabled={busy !== null || !form.email || !form.apiToken || !form.workspace}
                className="shrink-0 rounded border border-gray-300 px-2 text-[11px] text-gray-600 disabled:opacity-50"
              >
                {busy === 'repos' ? '…' : 'Load'}
              </button>
            </div>
          </div>
        </div>
        {repoOptions && (
          <div className="mt-2 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {repoOptions.map((slug) => {
              const selected = repoText.split(/[,\n]/).map((r) => r.trim()).includes(slug)
              return (
                <button
                  key={slug}
                  onClick={() => {
                    const current = repoText
                      .split(/[,\n]/)
                      .map((r) => r.trim())
                      .filter(Boolean)
                    setRepoText(
                      (selected
                        ? current.filter((r) => r !== slug)
                        : [...current, slug]
                      ).join(', '),
                    )
                  }}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    selected
                      ? 'border-blue-400 bg-blue-100 text-blue-800'
                      : 'border-gray-300 bg-white text-gray-600'
                  }`}
                >
                  {slug}
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded border border-gray-200 bg-white p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Sync
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={label}>Mode {!isPro && '(scheduled is Pro 🔒)'}</label>
            <select
              className={field}
              value={isPro ? form.syncMode : 'manual'}
              disabled={!isPro}
              onChange={(e) => set('syncMode', e.target.value as SyncMode)}
            >
              <option value="scheduled">Scheduled</option>
              <option value="manual">Manual only</option>
            </select>
          </div>
          <div>
            <label className={label}>Poll every (min)</label>
            <input
              className={field}
              type="number"
              min={1}
              value={form.pollMinutes}
              disabled={!isPro || form.syncMode !== 'scheduled'}
              onChange={(e) => set('pollMinutes', Number(e.target.value) || 15)}
            />
          </div>
          <div>
            <label className={label}>Stale after (hours)</label>
            <input
              className={field}
              type="number"
              min={1}
              value={form.staleThresholdHours}
              onChange={(e) => set('staleThresholdHours', Number(e.target.value) || 24)}
            />
          </div>
          <div>
            <label className={label}>Digest time {!isPro && '(Pro 🔒)'}</label>
            <input
              className={field}
              type="time"
              value={form.digestTime}
              disabled={!isPro}
              onChange={(e) => set('digestTime', e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded border border-gray-200 bg-white p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          AI review
        </h2>
        <div className="mb-2">
          <label className={label}>Provider</label>
          <select
            className={field}
            value={form.provider}
            onChange={(e) => set('provider', e.target.value as Provider)}
          >
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-gray-500">
            {PROVIDER_OPTIONS.find((p) => p.id === form.provider)?.hint}
          </p>
        </div>

        {form.provider === 'anthropic' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Anthropic API key</label>
              <input
                className={field}
                type="password"
                value={form.anthropicKey}
                onChange={(e) => set('anthropicKey', e.target.value)}
                placeholder="sk-ant-…"
              />
            </div>
            <div>
              <label className={label}>Model</label>
              <select
                className={field}
                value={form.model}
                onChange={(e) => set('model', e.target.value)}
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {form.provider === 'gemini' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Gemini API key</label>
              <input
                className={field}
                type="password"
                value={form.geminiKey}
                onChange={(e) => set('geminiKey', e.target.value)}
                placeholder="AIza…"
              />
            </div>
            <div>
              <label className={label}>Model</label>
              <div className="flex gap-1">
                <select
                  className={field}
                  value={form.geminiModel}
                  onChange={(e) => set('geminiModel', e.target.value)}
                >
                  {(geminiModels ?? GEMINI_MODELS.map((m) => m.id)).map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                  {!(geminiModels ?? GEMINI_MODELS.map((m) => m.id)).includes(
                    form.geminiModel,
                  ) && <option value={form.geminiModel}>{form.geminiModel}</option>}
                </select>
                <button
                  onClick={loadModels}
                  disabled={busy !== null || !form.geminiKey}
                  title="Fetch the models available to your key"
                  className="shrink-0 rounded border border-gray-300 px-2 text-[11px] text-gray-600 disabled:opacity-50"
                >
                  {busy === 'gemini' ? '…' : 'Load'}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-gray-400">
                Click Load to list the models your key can actually use — Google
                retires ids often.
              </p>
            </div>
          </div>
        )}

        {form.provider === 'ollama' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Ollama URL</label>
              <input
                className={field}
                value={form.ollamaUrl}
                onChange={(e) => set('ollamaUrl', e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>
            <div>
              <label className={label}>Model</label>
              <input
                className={field}
                value={form.ollamaModel}
                onChange={(e) => set('ollamaModel', e.target.value)}
                placeholder="qwen2.5-coder"
              />
            </div>
          </div>
        )}

        <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={form.autoReview}
            disabled={!isPro}
            onChange={(e) => set('autoReview', e.target.checked)}
          />
          Auto-review new PRs during scheduled polls {!isPro && '(Pro 🔒)'}
        </label>
        <p className="mt-1 text-[10px] text-gray-400">
          Keys stay in this browser's extension storage; requests go directly to the
          provider (or to your machine, for Ollama).
        </p>
      </section>

      <section className="rounded border border-gray-200 bg-white p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Tier (dev switch — replaced by ExtensionPay in milestone 6)
        </h2>
        <select
          className={field}
          value={devTier}
          onChange={(e) => setDevTier(e.target.value as Tier)}
        >
          <option value="pro">Pro</option>
          <option value="free">Free</option>
        </select>
      </section>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      <button
        onClick={saveAll}
        disabled={busy !== null || !form.email || !form.apiToken || !form.workspace}
        className="w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy === 'save' ? 'Validating…' : 'Validate & save'}
      </button>
    </div>
  )
}
