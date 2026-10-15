# Launch Kit — Chrome Web Store

## Store listing copy

**Name (45 chars max):** PR Review AI for Bitbucket

**Short description (132 chars max):**
Your Bitbucket pull-request queue with AI reviews — summaries, issue
detection, and one-click review comments. Bring your own key.

**Detailed description:**

Stop tab-hopping to review pull requests. PR Review AI puts your entire
Bitbucket review queue one click away — and pairs it with AI that actually
reads the diff.

⚡ PENDING PR DASHBOARD
See every PR waiting on you across your repositories. Filter by repo or
author, sort by priority, spot stale PRs instantly. A badge on the icon
shows your queue at all times.

🤖 AI REVIEWS, YOUR CHOICE OF BRAIN
Bring your own key — Anthropic Claude for the best quality, Google Gemini
on its free tier, or Ollama running 100% locally so your code never leaves
your machine. Get a streamed summary of any PR, or a full structured
review: security issues, missing validation, performance concerns,
duplication, naming, and logic bugs — each with severity and suggested
replacement code.

📝 REVIEW WITHOUT LEAVING THE POPUP
A full diff viewer (unified or side-by-side) with findings anchored to the
exact lines they concern. Post any finding — or the whole summary — back to
Bitbucket as inline comments with one click.

🔔 NEVER BE THE BOTTLENECK (Pro)
Scheduled sync notifies you of new assignments, nudges you about stale PRs,
and delivers a daily digest: reviewed today, pending count, average wait
time, critical PRs.

🔒 PRIVACY FIRST
No backend. No account. Your Bitbucket token and AI keys live in local
extension storage; requests go directly from your browser to Bitbucket and
your chosen AI provider. With Ollama, nothing leaves your machine at all.

FREE: dashboard, manual sync, diff viewer, 3 repos, 10 AI summaries/month.
PRO: unlimited repos & summaries, full structured reviews, scheduled sync +
notifications, daily digest, posting comments to Bitbucket.

**Category:** Developer Tools
**Language:** English

## Pricing (suggestion)

- Free tier as shipped.
- Pro: **$6/month or $49/year** via ExtensionPay. (Reviewers' AI costs are
  their own, so price on workflow value; > $8/mo hits resistance for a
  single-purpose tool.)

## Pre-submission checklist

Code (done ✅ / to do ⬜):
- ✅ MV3, minimal permissions (storage, alarms, notifications + 4 hosts)
- ✅ Free/Pro gating via entitlements module
- ✅ Icon set 16/32/48/128
- ⬜ ExtensionPay integration (milestone 6) — create account at
  extensionpay.com, add `extpay.js`, replace the dev tier switch in
  Settings, wire the 7-day offline grace from the spec
- ⬜ Better icon — the generated one is a placeholder; commission or design
  a proper 128px icon before launch (store first impressions matter)
- ⬜ End-to-end test with a real Bitbucket workspace on all 3 providers

Store account & listing:
- ⬜ Chrome Web Store developer account ($5 one-time) —
  chrome.google.com/webstore/devconsole
- ⬜ 3–5 screenshots at 1280×800 (dashboard, PR detail with findings in the
  diff gutter, settings with provider choice, digest) — open the extension
  in a tab for clean captures
- ⬜ Host the privacy policy (PRIVACY.md) at a public URL — GitHub Pages of
  the repo is fine — and link it in the listing
- ⬜ Justify each permission in the listing's privacy tab (storage = local
  config, alarms = polling, notifications = PR alerts, hosts = the APIs)
- ⬜ Zip `dist/` and upload

Review-time gotchas (Chrome team commonly flags):
- The `http://localhost/*` permission needs the Ollama explanation in the
  permission justification field.
- "Bring your own key" must be explicit in the listing (it is, above) so
  reviewers don't think you're proxying credentials.

## Post-launch (Track 2 — the real product)

Atlassian Marketplace app ("AI reviewer for Bitbucket Cloud"): Forge app +
webhook-driven review bot reusing `src/lib/` (bitbucket, diff, aiShared,
providers). Atlassian handles billing/licensing and puts you in front of
paying Bitbucket teams — per-seat B2B pricing ($3–5/user/mo is the norm for
dev tooling there). Start after the extension validates demand.
