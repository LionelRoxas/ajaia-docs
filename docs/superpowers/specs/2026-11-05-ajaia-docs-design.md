# Ajaia Docs — Design

Date: 2026-11-05 · Status: draft for approval

## Intent

A take-home for a Full Stack Product Engineer role (4–6 hour timebox). Build a lightweight Google Docs-style editor that shows product judgment: a **polished, solid core flow** rather than broad feature coverage. The owner will record a 3–5 minute walkthrough, so every feature must be easy to demo and explain.

Success: a reviewer opens the live URL, signs in as a demo user in one click, writes and formats a doc, imports a file, shares it, switches users, and sees it under "Shared with me" — with no rough edges.

## Brief requirements (from the Ajaia take-home)

- Core: create / rename / edit / save / reopen; rich text (B, I, U, headings, lists); one product-relevant file upload with supported types stated in UI + README; sharing with owner, grant access, owned vs shared distinction; persistence of docs, formatting, and shares.
- Quality: setup + run instructions, live deployment, basic validation and error handling, ≥1 meaningful automated test, short architecture note.
- AI workflow note: tools used, where AI sped things up, what AI output was changed or rejected, how correctness / UX / reliability were verified.
- 3–5 min walkthrough video: main flow, what works end to end, what was deprioritized, key decisions, how AI helped.
- Submission: one Google Drive folder with source, README, architecture note, AI note, `SUBMISSION.md`, live URL, video URL text file, demo credentials, local run steps. If partial: what works, what's incomplete, what's next with 2–4 more hours.
- Constraints: deliberate scope cuts, depth over breadth, reviewers pay for nothing. Optional stretch only after core is done.

## Goals

1. Create, rename, edit, autosave, and reopen documents.
2. Rich text: bold, italic, underline, headings (H1–H3), bulleted and numbered lists.
3. Upload `.txt`, `.md`, or `.docx` to create a new editable document.
4. Share a document with another user; clearly separate owned vs shared docs.
5. Persist documents, formatting, and sharing across refresh.
6. Safe concurrent edits: never silently overwrite someone else's changes.
7. Deployed on Vercel; README, architecture note, AI workflow note, tests.

## Non-goals (deliberately cut — list these in the README and video)

| Cut | Why |
|---|---|
| Redis / caching | Nothing at this scale needs it; one less service to configure. |
| Password reset, OAuth, email verification | Real sign-in exists; account-recovery flows add nothing to the demo. |
| Roles beyond owner / editor | Not required; one access level keeps the logic obvious. |
| Comments, version history, export | Stretch items. |
| Delete documents | Not required; deferred to keep scope tight. |
| Attachments, images in docs | Upload is covered by import. |

## Anti-goals

- Lost work: a save that silently overwrites another user's edits.
- A reviewer hitting a setup step, paywall, or sign-up form.
- Over-engineering that is hard to explain in the video.
- Verbose UI copy or docs.

## Constraints

- Next.js (App Router) + TypeScript for frontend and backend. (Owner's decision)
- Supabase Postgres for persistence. (Owner's decision)
- Deployed on Vercel. (Owner's decision)
- Free tiers only; reviewers pay for nothing.
- Simplest architecture that meets the brief. (Owner's decision)

## Decided

**Users (owner's decision: real auth, plus one-click demo accounts).** Supabase Auth with email + password (email confirmation off) via `@supabase/ssr` cookie sessions. Sign-in page offers sign-in, sign-up, and three "Continue as Alice / Bob / Carol" buttons. The demo buttons call a server action that signs in with the seeded account's password (held server-side in `DEMO_PASSWORD`, also listed in the README for manual sign-in). A `profiles` row (id = auth user id, email, name) is created by a trigger on `auth.users`. Header shows the current user and Sign out.

**Conflict handling (owner accepted).** Each document has an integer `version`. A save sends the version it was based on; the server updates only if it still matches, then increments it. On mismatch the save is rejected and the editor shows: "This document was changed by someone else. Reload to get the latest." Edits are never merged or overwritten.

*My calls on the details:* on conflict, autosave stops and the user's local content stays in the editor (read-only) with two actions: **Copy my text** (plain text to clipboard) and **Reload latest**. Title and content share the same `version`; all saves from one tab go through a single serialized queue so a rename and a content save never race each other.

## My calls (owner can override)

**Architecture.** One Next.js app. The browser talks to Supabase only for auth cookies; all data access is server-side (server actions / route handlers), which reads the signed-in user from the session, then queries with the service-role key. RLS is enabled with no policies so the public key can't read anything. Access rules live in one module (`lib/access.ts`) and every read/write goes through it.

**Data model.**

```
profiles         id uuid pk fk auth.users, email text unique, name text
documents        id uuid pk, owner_id uuid fk profiles, title text,
                 content jsonb, version int default 1,
                 created_at, updated_at
document_shares  document_id fk documents, user_id fk users,
                 (user_id fk profiles) created_at, pk (document_id, user_id)
```

Content is stored as Tiptap JSON, which preserves formatting and structure exactly.

**Access rules.**

| Action | Owner | Shared user | Other |
|---|---|---|---|
| View, edit content, rename | yes | yes | no (404) |
| Share / unshare | yes | no | no |

**Editor.** Tiptap with StarterKit + Underline. Toolbar: B, I, U, H1, H2, H3, bullet list, numbered list, with active states. Autosave ~1s after typing stops; status shows Saving… / Saved / Conflict / Error. Title is an inline input that saves on blur or Enter; empty becomes "Untitled document".

**Import.** "Upload" button on the document list. Accepts `.txt`, `.md`, `.docx`, max 1 MB (stated in the UI and README). Server converts to HTML (`.txt` escaped into paragraphs, `.md` via `marked`, `.docx` via `mammoth`), then to Tiptap JSON with the same extension set, so unsupported formatting is dropped cleanly. Creates a new doc titled from the filename and opens it.

**Sharing.** Owner opens a Share panel: list of people with access, an email input, Add, and Remove per person. Errors: unknown email, sharing with yourself, already shared.

**Pages.**

- `/` — sign in as a demo user
- `/docs` — "My documents" and "Shared with me" sections (shared items show the owner's name), New document, Upload
- `/docs/[id]` — title, toolbar, editor, save status, Share (owner only), "Shared by X" badge for shared users

**Validation and errors.** Title ≤ 200 chars; content ≤ 1 MB; file type and size checked server-side; unauthorized or missing docs return 404; all errors shown inline in plain language.

**Styling.** Tailwind, clean and minimal, centered page-like editor. Use the frontend-design skill for the UI pass.

**Tests (Vitest).** Access rules (owner, shared, stranger); version-conflict save logic; import conversion for each file type.

**Deliverables.** `README.md` (setup, run, env vars, demo accounts, supported file types, what's cut), `ARCHITECTURE.md`, `AI_WORKFLOW.md`, `SUBMISSION.md` (exact file list, live URL, demo accounts, what works / incomplete / next 2–4 hours), `VIDEO_URL.txt` (the video link only), SQL migration + seed under `supabase/`.

**Seed data.** Alice owns a "Welcome" doc shared with Bob, so the shared view is visible on first sign-in. Reviewers share one database and may see each other's docs; noted in the README. No reset feature.

**Keep-alive.** Supabase free projects pause after ~1 week idle. A daily Vercel cron hits `/api/health`, which runs a trivial query.

**Env vars.** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_PASSWORD`.

## Addendum (2026-11-05): live co-editing

Owner decision: add live editing before deploy. Approach chosen: **Yjs CRDT relayed over Supabase Realtime** (no new service). Replaces the "live co-editing" non-goal.

**Why not Google's way:** Google Docs uses Operational Transformation on a central always-on server. Vercel can't host persistent connections, and a CRDT needs no transform server — Supabase only relays and Postgres stores.

**Behaviour**
- Two people on the same doc see each other's text appear live, plus a named, colored caret each, and a small "Editing: Alice, Bob" presence line.
- Content conflicts no longer happen; the content conflict banner is retired. Lost access and expired session still make the editor read-only with the existing messages.
- Title stays a plain field: last write wins, broadcast to open tabs so it updates live. (Documented exception.)

**Data**
- New column `documents.ydoc text` — base64 Yjs state, the source of truth for content. `content jsonb` stays as a derived snapshot (doc list, import, fallback).
- First open of a doc with no `ydoc`: server converts `content` → Yjs state and stores it only `where ydoc is null`; if it lost that race it re-reads.

**Sync**
- One private Realtime channel per doc, `doc:{id}`. Broadcast events: `update` (Yjs update), `awareness` (carets/presence), `sync` (new joiner asks; peers reply with their state diff).
- Channel access: RLS policy on `realtime.messages` lets an authenticated user read/send on `doc:{id}` only if they own it or it's shared with them.
- Saving: each client sends its own unsaved local updates to a server action ~1s after typing stops. The server checks access, merges with stored state (`Y.mergeUpdates`), derives `content`, enforces the 1 MB limit, and writes with the existing version check, retrying up to 3 times on a race. Updates are idempotent, so duplicates are harmless. Failed saves keep the updates and resend.

**Known limits (documented):** a user unshared mid-session keeps receiving broadcasts until reconnect but can't save; title is last-write-wins.

## Left to the builder

Component structure, server actions vs route handlers per call, debounce timing, toolbar look, test file layout.
