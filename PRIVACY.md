# Privacy Policy — PR Review AI for Bitbucket

_Last updated: 2026-07-15_

## The short version

This extension has **no backend, no analytics, and no account system**. We
never see your code, your credentials, or your usage. Everything runs in
your browser.

## What the extension stores

All data is kept in Chrome's local extension storage (`chrome.storage.local`)
on your device only:

- Your Bitbucket email, API token, workspace, and repository list
- Your AI provider choice and API key (Anthropic or Google Gemini), or your
  local Ollama URL/model
- A cache of your pending pull requests and generated AI
  summaries/reviews
- Local usage counters for free-tier limits

This data never leaves your device except as described below. It is not
synced via your Google account and is deleted when you remove the
extension.

## Where data is sent

The extension makes network requests only to:

1. **api.bitbucket.org** — to list your pull requests, fetch diffs, and
   (only when you click a post button) create comments, authenticated with
   the API token you provide.
2. **Your chosen AI provider** — when you explicitly run an AI summary or
   review (or enable scheduled auto-review), the pull-request diff, title,
   and author are sent to exactly one of:
   - api.anthropic.com (your Anthropic key), or
   - generativelanguage.googleapis.com (your Google key), or
   - your own Ollama server (typically localhost — data stays on your
     machine).

No other destinations exist. There is no telemetry, no crash reporting, no
ad or tracking network.

## Code content

Pull-request diffs are sent to the AI provider **you** configured, under
**your** API key, subject to that provider's data policies. If your
employer's policy forbids sending code to cloud AI services, use the Ollama
(local) provider — no code leaves your machine.

## Payments

Pro subscriptions are processed by ExtensionPay/Stripe. We receive no card
details; ExtensionPay's privacy policy governs payment data.

## Contact

Questions: <YOUR-CONTACT-EMAIL>
