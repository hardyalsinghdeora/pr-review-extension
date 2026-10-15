# Bitbucket PR Review (AI) — Chrome Extension

Pending Bitbucket pull requests assigned to you, with AI-assisted reviews.
Spec: `~/Desktop/PR-Review-Chrome-Extension.md`.

## Build & load

```bash
npm install
npm run build        # outputs to dist/
```

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `dist/` folder.
3. Pin the extension; open the popup.

`npm run dev` gives HMR builds (reload the extension once after starting).

## First-run setup (popup → Settings)

1. **Atlassian email + API token** — create a token at
   Atlassian account settings → Security → API tokens.
2. **Workspace** slug, then **Load** to pick repositories (Free tier: 3 max).
3. **AI provider** — pick one:
   | Provider | Cost | Key |
   |---|---|---|
   | Anthropic Claude | pay-per-use (cents per review, best quality) | console.anthropic.com |
   | Google Gemini | **free tier** | aistudio.google.com (no card) |
   | Ollama | **free, local** | none — see below |

   Keys stay in local extension storage; requests go directly to the provider.

   **Ollama setup:** install from ollama.com, pull a model, and start the
   server with extension origins allowed:

   ```bash
   ollama pull qwen2.5-coder
   OLLAMA_ORIGINS="chrome-extension://*" ollama serve
   ```
4. Pick sync mode: **Scheduled** (Pro) polls on an interval and notifies;
   **Manual** syncs only via the Refresh button.
5. **Validate & save** — verifies the token against `/2.0/user` and
   registers alarms.

## Tiers

Entitlement is a dev switch in Settings until milestone 6 (ExtensionPay).
Default is **Pro** so everything is testable. Switch to **Free** to exercise
gating: manual-only sync, 3 repos, 10 summaries/month, no full review /
digest / comment posting.

## Layout

- `src/background/` — service worker: alarms (poll/digest), sync,
  notifications, badge, optional auto-review.
- `src/lib/` — `bitbucket.ts` (REST), `ai.ts` (Claude via
  `@anthropic-ai/sdk`), `diff.ts` (noise filter + AI budget),
  `entitlements.ts` (tier gate), `storage.ts` (typed storage).
- `src/popup/` — React UI: Dashboard, PR detail (diff viewer +
  AI summary/review + comment posting), Digest, Settings.

## Verification status

- `npm run typecheck` and `npm run build` pass.
- End-to-end flows (Bitbucket sync, AI review, comment posting) need real
  credentials — untested in CI; exercise them after first-run setup.
