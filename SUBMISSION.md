# Submission

**Live URL:** https://ajaia-docs-lac-psi.vercel.app
**Video (3:11):** https://youtu.be/vvMI8TDDxUQ (also in `VIDEO_URL.txt`)
**Source code:** https://github.com/LionelRoxas/ajaia-docs

## Demo credentials

Continue as Alice / Bob / Carol with one click, or sign in with `alice@demo.test`, `bob@demo.test` or `carol@demo.test` and password `Demo-_Q2oYBHe` (demo-only, shared by all three).

## Run locally

See [README.md](README.md#run-locally).

## What is in the Drive folder

```
README.md              setup, demo accounts, tour, what is cut
ARCHITECTURE.md        design, decisions, known limitations
AI_WORKFLOW.md         how AI was used and checked
SUBMISSION.md          this file
VIDEO_URL.txt          walkthrough link
AGENTS.md              notes for AI coding agents (Next.js 16)
docs/REVIEW_LOG.md     review findings and decisions
docs/superpowers/      design spec and implementation plan
app/  components/  lib/  tests/  scripts/   source
public/ajaia-logo.png  logo
.github/workflows/     CI (lint, typecheck, tests, build)
supabase/migrations/   0001_init, 0002_ydoc, 0003_realtime_access, 0004_share_epoch, 0005_unshare_atomic
package.json  package-lock.json  .env.example  .gitignore  .mcp.json  vercel.json
next.config.ts  proxy.ts  tsconfig.json  vitest.config.mts
eslint.config.mjs  postcss.config.mjs
```

(No `.env.local`, `node_modules`, `.next` or `.vercel`.)

## What works

- Create, rename, edit, autosave, reopen; bold, italic, underline, H1-H3, bullet and numbered lists.
- Upload `.txt`, `.md`, `.docx` (up to 1 MB) into new documents.
- Share by email (owner only), unshare, "My documents" vs "Shared with me".
- Live co-editing with named carets and presence; unsharing cuts a user off within seconds.
- Real sign-in and sign-up, plus one-click demo accounts.
- Owner-only delete (peers on the doc are cut off within seconds).
- 111 automated tests; CI runs lint, typecheck, tests and a build on every push and PR; merges to `main` deploy to Vercel.

## Incomplete

- Title is last-write-wins; presence names are not identity-bound.
- Sign-up has no email verification; sharing reveals whether an account exists.
- No version history, roles, offline, or share emails.

Details and fixes: [ARCHITECTURE.md](ARCHITECTURE.md#known-limitations).

## Next 2-4 hours

1. Email on share via a verified sending domain.
2. View-only role.
3. Identity-bound presence.
