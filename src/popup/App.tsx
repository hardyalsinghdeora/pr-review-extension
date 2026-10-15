import { useEffect, useState } from 'react'
import { load } from '../lib/storage'
import {
  isConfigured,
  type CachedPr,
  type PrCache,
  type Settings,
  type Tier,
} from '../types'
import Dashboard from './components/Dashboard'
import Digest from './components/Digest'
import PrDetail from './components/PrDetail'
import SettingsView from './components/Settings'

type View = 'dashboard' | 'digest' | 'settings'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [cache, setCache] = useState<PrCache | null>(null)
  const [tier, setTier] = useState<Tier>('pro')
  const [view, setView] = useState<View>('dashboard')
  const [openPr, setOpenPr] = useState<CachedPr | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    void (async () => {
      const s = await load('settings')
      setSettings(s)
      setCache(await load('prCache'))
      setTier((await load('entitlement')).tier)
      if (!isConfigured(s)) setView('settings')
    })()
  }, [])

  const refresh = async () => {
    setSyncing(true)
    try {
      const res = (await chrome.runtime.sendMessage({ type: 'sync' })) as PrCache
      if (res && Array.isArray(res.prs)) setCache(res)
    } finally {
      setSyncing(false)
    }
  }

  if (!settings) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>
  }

  if (openPr) {
    return (
      <PrDetail
        pr={openPr}
        settings={settings}
        tier={tier}
        onBack={() => setOpenPr(null)}
      />
    )
  }

  const tabs: Array<{ id: View; label: string; pro?: boolean }> = [
    { id: 'dashboard', label: 'Pending PRs' },
    { id: 'digest', label: 'Digest', pro: true },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="flex min-h-[540px] flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">PR Review</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
              tier === 'pro' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {tier}
          </span>
        </div>
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                view === t.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
              {t.pro && tier === 'free' ? ' 🔒' : ''}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto">
        {view === 'dashboard' && (
          <Dashboard
            cache={cache}
            syncing={syncing}
            onRefresh={refresh}
            onOpen={setOpenPr}
            staleThresholdHours={settings.staleThresholdHours}
          />
        )}
        {view === 'digest' &&
          (tier === 'pro' ? (
            <Digest cache={cache} staleThresholdHours={settings.staleThresholdHours} />
          ) : (
            <UpgradePrompt feature="The daily digest" />
          ))}
        {view === 'settings' && (
          <SettingsView
            settings={settings}
            tier={tier}
            onSaved={(s, t) => {
              setSettings(s)
              setTier(t)
              setView('dashboard')
              void refresh()
            }}
          />
        )}
      </main>
    </div>
  )
}

export function UpgradePrompt({ feature }: { feature: string }) {
  return (
    <div className="m-6 rounded-lg border border-blue-200 bg-blue-50 p-6 text-center">
      <div className="text-sm font-semibold text-blue-900">{feature} is a Pro feature</div>
      <p className="mt-1 text-xs text-blue-800">
        Upgrade to unlock scheduling, the daily digest, full AI reviews, and posting
        comments back to Bitbucket.
      </p>
      <button className="mt-3 rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white">
        Upgrade to Pro
      </button>
    </div>
  )
}
