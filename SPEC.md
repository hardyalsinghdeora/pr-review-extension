# PR Review Chrome Extension — Technical Spec

## Goal

Build a Chrome extension that lists pending Bitbucket Cloud pull requests
assigned to the current user and provides AI-assisted reviews (summary,
issue detection, suggested changes), with periodic notifications and a
daily digest.

## Guiding decisions

These resolve the ambiguities in the original plan:

1. **Auth v1 is an Atlassian API token, not OAuth.** Bitbucket app passwords
   are being sunset in favor of scoped API tokens; a paste-a-token settings
   screen ships in hours and avoids MV3 OAuth complexity (consumer
   registration, `launchWebAuthFlow`, refresh in a short-lived service
   worker). OAuth via `chrome.identity` is deferred to a later milestone.
2. **Repositories are explicitly configured, not auto-discovered.**
   Bitbucket Cloud has no single cross-workspace "PRs I'm reviewing"
   endpoint; PR listing is per-repository. Settings hold a workspace +
   repo-slug list (with a helper that lists repos the user is a member of
   to make picking easy).
3. **AI calls go direct from the extension with a user-supplied Anthropic
   API key** stored in `chrome.storage.local`. This is acceptable for a
   personal/team-internal tool where each user brings their own key. If the
   extension is ever distributed with a shared key, a backend proxy becomes
   mandatory — that is the only scenario in which the "optional backend"
   exists.
4. **All scheduling uses `chrome.alarms`.** MV3 service workers are killed
   after ~30s idle; `setInterval`/in-memory timers are not viable. All
   state that must survive worker restarts lives in `chrome.storage`.
5. **Two tiers: Free and Pro.** Free covers the core manual workflow
   (dashboard + manual sync + AI summary with your own key); Pro unlocks
   automation and depth (scheduling, notifications, digest, full structured
   review, comment posting). Entitlement is a license check, not separate
   builds — one extension, features gated at runtime.

## Free vs Pro

| Capability | Free | Pro |
|---|---|---|
| Bitbucket auth + settings | ✅ | ✅ |
| Pending PR dashboard (filter/sort, badge) | ✅ | ✅ |
| Manual sync (Refresh button) | ✅ | ✅ |
| Inline diff viewer (unified + split) | ✅ | ✅ |
| Gutter-anchored AI finding cards in diff | ❌ (needs full review) | ✅ |
| Configured repositories | up to 3 | unlimited |
| Scheduled sync (`chrome.alarms`) + notifications | ❌ manual only | ✅ configurable interval |
| AI summary (user's own Anthropic key) | ✅ 10 / month | ✅ unlimited |
| Full structured AI review (findings, severity, suggested changes) | ❌ | ✅ |
| Auto-review on schedule | ❌ | ✅ |
| Daily digest | ❌ | ✅ |
| Post review comments back to Bitbucket | ❌ | ✅ |
| Review analytics (future) | ❌ | ✅ |

Rationale: AI inference costs are the user's (their key), so the paywall sits
on **automation and workflow depth**, not on tokens. The free tier must be
genuinely useful — dashboard + manual summaries — or it won't drive adoption.

### Licensing mechanics

- **ExtensionPay** (Stripe-backed, purpose-built for extensions, no backend
  of our own) as the v1 licensing provider; a Lemon Squeezy license key is
  the fallback if we outgrow it.
- Entitlement is fetched on startup and cached in `chrome.storage.local` as
  `{ tier, checkedAt }`; re-validated daily via the existing alarm handler.
- **Offline grace:** if validation is unreachable, the cached tier remains
  valid for 7 days before degrading to Free. Degrading never deletes data —
  Pro-only config (extra repos, schedules) is kept but inactive, and alarms
  are cleared.
- Gating is a single `entitlements.ts` module (`can("scheduledSync")`,
  `can("fullReview")`, …) so UI and worker check one source of truth; locked
  features render with an upgrade prompt rather than disappearing.
- Free-tier AI summary quota is tracked locally per calendar month
  (`aiUsage` in storage). It's soft enforcement — this is a convenience
  gate, not DRM; determined users editing local storage is an accepted
  non-goal.

## Architecture

```text
┌────────────────────────────────────────────────────────────┐
│ Chrome Extension (Manifest V3)                             │
│                                                            │
│  Popup (React)                Background Service Worker    │
│  ├─ Pending PR dashboard      ├─ chrome.alarms handlers    │
│  ├─ PR detail + AI review     │   ├─ poll (15 min)         │
│  ├─ Daily digest view         │   └─ digest (daily)        │
│  └─ Settings                  ├─ Bitbucket sync            │
│         │                     ├─ chrome.notifications      │
│         │  messages/storage   └─ badge count               │
│         ▼                                                  │
│  chrome.storage.local  ◄──────────────┘                    │
│  ├─ settings (tokens, repos, thresholds)                   │
│  ├─ prCache (last sync snapshot)                           │
│  ├─ reviewCache (AI results keyed by PR + source hash)     │
│  └─ digestStats (rolling event log)                        │
│                                                            │
│  lib/ (shared by popup + worker)                           │
│  ├─ bitbucket.ts   (REST client, pagination, diff)         │
│  ├─ ai.ts          (@anthropic-ai/sdk review pipeline)     │
│  ├─ diff.ts        (parse, chunk, truncate unified diffs)  │
│  └─ storage.ts     (typed storage accessors)               │
└────────────────────────────────────────────────────────────┘
        │ https                          │ https
        ▼                                ▼
  api.bitbucket.org/2.0            api.anthropic.com
```

No content script is needed for v1 (the popup is the whole UI). A content
script that injects an "AI review" button into bitbucket.org PR pages is a
later enhancement.

## Technology stack

- Manifest V3, TypeScript, React 18, Vite + `@crxjs/vite-plugin`
  (MV3-aware HMR builds), Tailwind CSS
- `chrome.storage.local`, `chrome.alarms`, `chrome.notifications`
- `@anthropic-ai/sdk` (browser mode) for AI review

### Manifest essentials

```jsonc
{
  "manifest_version": 3,
  "permissions": ["storage", "alarms", "notifications"],
  "host_permissions": [
    "https://api.bitbucket.org/*",
    "https://api.anthropic.com/*"
  ],
  "background": { "service_worker": "src/background/index.ts", "type": "module" },
  "action": { "default_popup": "src/popup/index.html" }
}
```

`host_permissions` is required for cross-origin `fetch` from the worker and
popup.

## Authentication (Milestone 1)

- Settings screen collects: **Atlassian account email + API token**,
  workspace slug, repository list. (Milestone 2 adds sync mode —
  scheduled vs manual — poll interval, and the auto-review toggle here.)
- Requests use HTTP Basic auth: `Authorization: Basic base64(email:token)`.
- Validate on save with `GET /2.0/user` (also captures the user's `uuid`
  and `account_id`, needed for reviewer filtering).
- Store in `chrome.storage.local` (never `sync` — tokens shouldn't ride
  Chrome sync). Note in the UI that the token grants repo access and can be
  revoked from Atlassian account settings.

## Bitbucket API integration

Base: `https://api.bitbucket.org/2.0`

| Purpose | Request |
|---|---|
| Validate token / get self | `GET /user` → `uuid` |
| List candidate repos | `GET /repositories/{workspace}?role=member&pagelen=100` |
| Pending PRs per repo | `GET /repositories/{ws}/{repo}/pullrequests?q=state="OPEN" AND reviewers.uuid="{uuid}"&fields=+values.participants&pagelen=50` |
| PR detail | `GET /repositories/{ws}/{repo}/pullrequests/{id}` |
| PR diff | `GET /repositories/{ws}/{repo}/pullrequests/{id}/diff` (302 → raw unified diff; `fetch` follows it) |
| Commits | `GET /repositories/{ws}/{repo}/pullrequests/{id}/commits` |
| Comments (read) | `GET /repositories/{ws}/{repo}/pullrequests/{id}/comments` |
| Comments (write, M5) | `POST .../comments` with `{content: {raw}, inline: {path, to}}` |

Client rules:

- Follow `next` links for pagination (all list endpoints are paginated).
- Fan out per-repo requests with `Promise.allSettled`; a failing repo must
  not blank the whole dashboard.
- Use `participants[].approved` / own participant state to compute
  "waiting on me" vs "already reviewed".
- Handle 429 with backoff; surface 401 as a "reconnect" banner.

### Sync + derived dashboard data

Each poll writes a normalized snapshot to `prCache`:

```ts
interface CachedPr {
  workspace: string; repo: string; id: number;
  title: string; author: string; link: string;
  createdOn: string; updatedOn: string;
  commentCount: number; approvedByMe: boolean;
  sourceCommit: string;            // for AI review cache invalidation
}
```

Dashboard features (filter by repo/author/age, sort by priority) are pure
client-side operations over this snapshot. Priority = age of oldest
unreviewed activity, weighted by draft status and size.

## Sync & notifications (Milestone 2)

### Run modes (user setting)

Settings expose a **sync mode** toggle. Scheduled mode is **Pro**; Free is
manual-only (the toggle renders locked with an upgrade prompt):

- **Scheduled (default):** `chrome.alarms.create("poll", { periodInMinutes })`
  with a configurable interval (default 15 min). Registered on
  `onInstalled` + `onStartup` (alarms survive worker death but not
  reinstall).
- **Manual:** no polling alarm is registered (any existing one is cleared
  on toggle). Sync runs only when the user hits the **Refresh** button in
  the popup — which is always present in both modes. Notifications are
  effectively off in manual mode; the badge and dashboard update on each
  manual refresh.

The same choice applies to AI review: reviews always run **manually** via a
per-PR "Review" button, plus an optional **auto-review on schedule** setting
(off by default) that, in scheduled mode, runs the AI summary for newly
assigned or newly pushed PRs during the poll — bounded by the review cache
so each source commit is reviewed at most once.

### Poll behavior

- On poll (alarm or manual): sync → diff against previous snapshot →
  in scheduled mode, notify via `chrome.notifications` for (a) newly
  assigned PRs, (b) PRs older than a configurable threshold (highlight
  oldest first). Clicking a notification opens the PR.
- Update the action badge with the pending count every sync, in both modes.

## Daily digest (Milestone 2.5, Pro)

- Second alarm at a configured local time.
- `digestStats` accumulates events during polls: PR first-seen time,
  approved-by-me transitions, closed/merged transitions.
- Digest = reviewed today, current pending count, average waiting time
  (now − createdOn across pending), critical PRs (age > threshold or
  title/labels matching configured patterns). Rendered as a popup view; a
  notification links to it.

## AI review (Milestones 3–4)

Tiering: the streamed **summary** is Free (10/month, unlimited on Pro); the
**full structured review** below is Pro-only. Both run on the user's own
credentials.

### Provider abstraction

`lib/ai.ts` is a dispatcher over three adapters (`lib/providers/*`), all
implementing `summarize()` (streamed text) and `review()` (raw JSON, then
validated against the shared zod schema):

| Provider | Cost | Notes |
|---|---|---|
| **Anthropic Claude** (default) | pay-per-use | `@anthropic-ai/sdk`, adaptive thinking, native structured outputs |
| **Google Gemini** | free tier | REST + SSE streaming; `responseSchema` JSON mode for the review |
| **Ollama** | free, local | NDJSON streaming; JSON-schema `format` for the review; requires `OLLAMA_ORIGINS="chrome-extension://*"` |

Non-native schema outputs are normalized (missing nullable fields filled)
before zod validation, so weak local models fail loudly rather than
rendering broken finding cards. Extension tiering (Free/Pro) is independent
of provider choice — inference costs are always the user's.

### Client

`@anthropic-ai/sdk` in the extension context:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: settings.anthropicKey,   // user-supplied, from chrome.storage
  dangerouslyAllowBrowser: true,   // acceptable: key belongs to the user
});
```

- Model: `claude-opus-4-8` (default; a settings dropdown may offer
  `claude-sonnet-5` for cheaper runs and `claude-haiku-4-5` for
  summaries-only).
- Thinking: `thinking: { type: "adaptive" }`.
- Streaming (`client.messages.stream`) for the summary view so the popup
  renders progressively; `max_tokens: 64000` on streamed full reviews.

### Diff preparation (`lib/diff.ts`) — required before any AI call

1. Parse the unified diff into per-file hunks.
2. Drop noise files (lockfiles, generated code, binaries, minified assets)
   — configurable globs.
3. Budget: cap total payload (~150k characters to start). If over budget,
   include full hunks for source files by priority and list omitted files
   by name so the model knows the review is partial.
4. If a single PR still exceeds budget, run per-file-group passes and merge
   findings.

### Structured review output

Full review uses structured outputs so findings render as typed cards and
can later be posted as inline comments:

```ts
output_config: {
  format: zodOutputFormat(z.object({
    summary: z.string(),
    riskLevel: z.enum(["low", "medium", "high"]),
    findings: z.array(z.object({
      category: z.enum(["security", "validation", "performance",
                        "duplication", "naming", "logic"]),
      severity: z.enum(["info", "minor", "major", "critical"]),
      file: z.string(),
      line: z.number().nullable(),   // new-file line number from the hunk
      explanation: z.string(),
      suggestedChange: z.string().nullable(),  // replacement code if applicable
    })),
  })),
}
```

The prompt includes PR title/description, the prepared diff, and an
instruction to report every issue found with severity attached (filtering
happens in the UI, not in the model).

### Caching

`reviewCache` keyed by `{workspace}/{repo}/{id}@{sourceCommit}` — a review
is reused until the PR gets new commits. This bounds API spend.

## Diff viewer (Milestone 3.5, Free)

In-popup rendering of the PR diff, so summaries and findings can be checked
without tabbing to Bitbucket.

- **Stack:** `react-diff-view` + `gitdiff-parser` for structure, `prismjs`
  for per-line syntax highlighting, `jsdiff` for intraline (word-level)
  change highlighting on paired add/remove lines.
- **Shared parse:** `lib/diff.ts` parses the raw `/diff` response once; the
  parsed model feeds both the AI chunking pipeline and the viewer.
- Unified view by default in the popup; split (side-by-side) view in the
  full-tab detail page. Collapse unchanged regions and virtualize long
  files — large PRs must not freeze the popup.
- The viewer renders from the patch only (no full-file fetch). Expanding
  context beyond hunk boundaries via
  `GET /repositories/{ws}/{repo}/src/{commit}/{path}` is a later
  enhancement, not v1.
- **Tiering:** the viewer is Free. Gutter widgets that anchor AI finding
  cards to `(file, line)` ship with the full structured review (Pro), and
  each card's "post as comment" action is milestone 5 (Pro) — no new
  entitlement flags needed.

## Posting comments back (Milestone 5, Pro)

- "Post as comments" button on a completed review: each accepted finding →
  `POST .../comments` with `inline: { path, to: line }`; summary → one
  top-level comment.
- Requires the Bitbucket token to have PR write scope. Findings without a
  mappable line fall back to the summary comment.
- Always behind explicit user action — never auto-post.

## Project structure

```text
pr-review-extension/
├── manifest.config.ts        # crxjs manifest definition
├── vite.config.ts
├── src/
│   ├── background/index.ts   # alarms, sync, notifications, badge
│   ├── popup/                # React app: Dashboard, PrDetail, Digest, Settings, Upgrade
│   ├── lib/
│   │   ├── bitbucket.ts
│   │   ├── ai.ts
│   │   ├── diff.ts
│   │   ├── entitlements.ts   # tier gating: can("scheduledSync") etc.
│   │   └── storage.ts
│   └── types.ts
└── package.json
```

## Milestones & acceptance criteria

1. **Auth + settings** — token validated against `/user`; workspace/repo
   config persisted; bad token shows actionable error.
2. **Dashboard + notifications** — PRs where I'm a reviewer listed across
   configured repos with filter/sort; badge count; sync mode toggle works
   (scheduled alarm notifies on new assignments; manual mode polls only on
   Refresh and registers no alarm); survives browser restart.
3. **AI summary** — per-PR streamed summary from the prepared diff; result
   cached by source commit; oversized PRs degrade gracefully (partial
   review disclosed).
3.5. **Diff viewer** — unified diff renders in the PR detail view with
   syntax + intraline highlighting; large PRs stay responsive (collapse +
   virtualization); split view in full-tab mode.
4. **Full AI review** — structured findings across the six categories with
   severity + suggested changes, rendered as cards **and anchored as gutter
   widgets in the diff viewer**.
5. **Post comments to Bitbucket** — accepted findings posted as inline
   comments; summary as top-level comment.
6. **Licensing / Pro tier** — ExtensionPay integration; `entitlements.ts`
   gates scheduled sync, digest, full review, comment posting, and the
   3-repo/10-summary Free limits; offline grace works (cached tier honored
   for 7 days, then clean degrade to Free without data loss); locked
   features show upgrade prompts.
7. **(Later) OAuth, options page repo auto-discovery, content-script button
   on bitbucket.org, Jira/Slack integration, review analytics (Pro),
   per-repo review rules.**

Milestones 1–5 are built tier-unaware first; milestone 6 layers gating on
top via `entitlements.ts`. During development everything runs as Pro.

## Risks

- **Reviewer-listing scale:** N configured repos = N requests per poll.
  Fine for ≤ ~20 repos; beyond that, stagger polls or cache ETags.
- **Anthropic key in extension storage:** acceptable only while keys are
  user-owned; revisit before any public distribution.
- **Diff size variance:** the chunking budget needs tuning against real
  PRs early in milestone 3 — treat the first oversized PR as a test case,
  not an edge case.
