# Ajaia Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a lightweight Google Docs-style editor (create, format, import, share, reopen) with real auth, demo accounts, and safe concurrent saves, deployed on Vercel.

**Architecture:** One Next.js App Router app. Browser uses Supabase only for auth cookies; all data access runs server-side through service functions (`lib/documents.ts`, `lib/sharing.ts`) that take a `Repo` interface — a Supabase implementation in production, an in-memory one in tests. Saves use optimistic locking on `documents.version`.

**Tech Stack:** Next.js (latest, App Router) + TypeScript, Tailwind, Tiptap, Supabase (Postgres + Auth, `@supabase/ssr`), `marked`, `mammoth`, Vitest, Vercel.

**Spec:** `docs/superpowers/specs/2026-11-05-ajaia-docs-design.md`

## Global Constraints

- Timebox 4–6 hours total; stop and document if exceeded.
- Free tiers only; reviewers pay for nothing.
- Service-role key is server-only; never imported by a client component.
- Demo users: `alice@demo.test` "Alice", `bob@demo.test` "Bob", `carol@demo.test` "Carol"; password from `DEMO_PASSWORD`.
- Limits: title ≤ 200 chars; content ≤ 1,000,000 bytes (JSON-serialized); upload ≤ 1 MB (1,048,576 bytes); upload types `.txt`, `.md`, `.docx` only.
- Default title: `Untitled document`.
- UI copy (exact): sections `My documents` / `Shared with me`; badge `Shared by {name}`; upload hint `Supports .txt, .md, .docx up to 1 MB`; save status `Saving…` / `Saved` / `Conflict` / `Error`; conflict message `This document was changed by someone else. Reload to get the latest.`; conflict buttons `Copy my text` / `Reload latest`.
- Unauthorized or missing documents return 404 — never reveal existence.
- Concise copy everywhere; no filler text.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_PASSWORD`.

## Review Focus

1. **Typing while a save is in flight** — no duplicate or out-of-order saves; latest text wins once. Test in Task 7 (`save-queue`).
2. **Access removed mid-edit** — owner unshares while Bob edits; Bob's next save returns not_found and the UI says he no longer has access, not a generic error. Test in Task 3.
3. **Share email with caps/whitespace** (`  Bob@Demo.test `) — matches Bob. Test in Task 4.
4. **`.docx` with images/tables, or a corrupt file** — imports text cleanly or returns a clear error; never a 500. Test in Task 5.
5. **Oversized paste** (>1 MB content) — save rejected with `invalid`, editor shows Error with a message; nothing truncated silently. Test in Task 3.

---

## File Structure

```
app/
  layout.tsx, globals.css
  page.tsx                  sign-in / sign-up / demo buttons
  auth/actions.ts           signIn, signUp, signInAsDemo, signOut
  docs/page.tsx             document list
  docs/actions.ts           createDocumentAction, importDocumentAction
  docs/[id]/page.tsx        editor page (server loads doc)
  docs/[id]/actions.ts      saveDocumentAction, shareAction, unshareAction
  api/health/route.ts       keep-alive
components/
  Header.tsx, UploadButton.tsx, DocEditor.tsx, Toolbar.tsx,
  SaveStatus.tsx, SharePanel.tsx
lib/
  types.ts                  shared types (below)
  limits.ts                 constants from Global Constraints
  access.ts                 pure access rules
  repo.ts                   Repo interface + supabaseRepo()
  repo.memory.ts            memoryRepo() for tests
  documents.ts              document service
  sharing.ts                sharing service
  import.ts                 file → Tiptap JSON
  editor-extensions.ts      single extension list (client + server)
  save-queue.ts             client serialized save queue
  supabase/server.ts        createSessionClient(), createAdminClient()
  auth.ts                   requireUser()
middleware.ts               session refresh + redirect (proxy.ts if the installed Next version uses it)
supabase/migrations/0001_init.sql
scripts/seed.ts
tests/*.test.ts
vercel.json
README.md, ARCHITECTURE.md, AI_WORKFLOW.md, SUBMISSION.md, VIDEO_URL.txt
```

### Shared types (`lib/types.ts`, created in Task 3)

```ts
import type { JSONContent } from '@tiptap/core'
export type Profile = { id: string; email: string; name: string }
export type DocRow = { id: string; owner_id: string; title: string; content: JSONContent; version: number; created_at: string; updated_at: string }
export type DocSummary = { id: string; title: string; updated_at: string }
export type SharedSummary = DocSummary & { owner_name: string }
export type Role = 'owner' | 'editor'
export type ErrorCode = 'not_found' | 'forbidden' | 'conflict' | 'invalid' | 'unauthorized'
export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorCode; message: string }
```

---

### Task 1: Scaffold + Supabase project + schema

**Files:**
- Create: Next.js app at repo root, `vitest.config.ts`, `.env.example`, `supabase/migrations/0001_init.sql`, `scripts/seed.ts`
- Modify: `.gitignore` (add `.env*.local`)

**Interfaces:**
- Produces: tables `profiles`, `documents`, `document_shares`; seeded demo users and Alice's "Welcome" doc shared with Bob; `npm test` runs Vitest.

- [ ] **Step 1:** Confirm the session runs in `ajaia-docs` and the write-enabled `supabase` server from `.mcp.json` is signed in (owner runs `/mcp` once).
- [ ] **Step 2:** `npx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm` (keep existing README/docs). Install: `@supabase/supabase-js @supabase/ssr @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/html marked mammoth` and dev `vitest tsx dotenv`. If Tiptap resolves to v2, also install `@tiptap/extension-underline` (v3 StarterKit includes Underline).
- [ ] **Step 3:** Add `"test": "vitest run"` and `"seed": "tsx scripts/seed.ts"` scripts; `vitest.config.ts` with `@` alias and `environment: 'node'`.
- [ ] **Step 4:** Create Supabase project `ajaia-docs` (free, owner's org, nearest region) via MCP; disable email confirmation in Auth settings (dashboard step for owner if MCP can't).
- [ ] **Step 5:** Write `0001_init.sql`:
  - `profiles (id uuid pk references auth.users on delete cascade, email text unique not null, name text not null)`
  - `documents (id uuid pk default gen_random_uuid(), owner_id uuid not null references profiles on delete cascade, title text not null default 'Untitled document' check (char_length(title) between 1 and 200), content jsonb not null default '{"type":"doc","content":[]}', version int not null default 1, created_at timestamptz default now(), updated_at timestamptz default now())`
  - `document_shares (document_id uuid references documents on delete cascade, user_id uuid references profiles on delete cascade, created_at timestamptz default now(), primary key (document_id, user_id))`
  - index on `documents(owner_id)`, `document_shares(user_id)`
  - trigger `on auth.users insert` → insert profile with `lower(email)` and `coalesce(raw_user_meta_data->>'name', split_part(email,'@',1))`
  - `enable row level security` on all three tables, no policies.
- [ ] **Step 6:** Apply migration via MCP; verify with `list_tables` that 3 tables exist with RLS enabled.
- [ ] **Step 7:** `scripts/seed.ts` (loads `.env.local`): idempotently create the 3 demo users via `auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { name } })`, skipping existing; create Alice's `Welcome` doc (short formatted intro: H1, paragraph, bullet list) if none exists; share it with Bob.
- [ ] **Step 8:** Fill `.env.local` (keys via MCP `get_project_url` / `get_publishable_keys`; service-role key from dashboard if MCP can't return it); run `npm run seed`; verify via `execute_sql`: 3 profiles, 1 document, 1 share.
- [ ] **Step 9:** `npm run build` passes. Commit `chore: scaffold Next.js app, schema, seed`.

### Task 2: Supabase clients + auth

**Files:**
- Create: `lib/supabase/server.ts`, `lib/auth.ts`, `middleware.ts`, `app/auth/actions.ts`, `app/page.tsx`, `components/Header.tsx`, `app/layout.tsx` (modify)

**Interfaces:**
- Produces: `createSessionClient(): Promise<SupabaseClient>` (cookie-bound, anon key); `createAdminClient(): SupabaseClient` (service role, `import 'server-only'`); `requireUser(): Promise<Profile>` — redirects to `/` if no session; `getUser(): Promise<Profile | null>`.
- Server actions: `signIn(formData)`, `signUp(formData)` (fields `email`, `password` ≥ 8 chars, `name`), `signInAsDemo(email: string)` (rejects emails not in the demo list), `signOut()`. Success → `redirect('/docs')`; failure → return `{ error: string }` shown inline.

- [ ] **Step 1:** Implement clients per current `@supabase/ssr` docs (search_docs via MCP for the Next.js App Router pattern).
- [ ] **Step 2:** Middleware refreshes the session; unauthenticated requests to `/docs/*` redirect to `/`; authenticated requests to `/` redirect to `/docs`.
- [ ] **Step 3:** Sign-in page: three `Continue as Alice / Bob / Carol` buttons on top, then a sign-in / sign-up form toggle. Header: app name, current user name, Sign out.
- [ ] **Step 4:** Manual check in browser: each demo button lands on `/docs` with the right name in the header; sign-up creates a profile row; bad password shows an inline error; `/docs` while signed out redirects to `/`.
- [ ] **Step 5:** Commit `feat: Supabase auth with one-click demo accounts`.

### Task 3: Access rules, repo, document service

**Files:**
- Create: `lib/types.ts`, `lib/limits.ts`, `lib/access.ts`, `lib/repo.ts`, `lib/repo.memory.ts`, `lib/documents.ts`
- Test: `tests/access.test.ts`, `tests/documents.test.ts`

**Interfaces:**
- `limits.ts`: `TITLE_MAX = 200`, `CONTENT_MAX_BYTES = 1_000_000`, `UPLOAD_MAX_BYTES = 1_048_576`, `DEFAULT_TITLE = 'Untitled document'`, `DEMO_USERS: { email: string; name: string }[]`.
- `access.ts`: `roleFor(doc: Pick<DocRow,'owner_id'>, sharedUserIds: string[], userId: string): Role | null`; `canEdit(role: Role | null): boolean`; `canShare(role: Role | null): boolean`.
- `repo.ts`:
  ```ts
  export interface Repo {
    getProfileByEmail(email: string): Promise<Profile | null>
    getDocument(id: string): Promise<DocRow | null>
    getSharedUserIds(docId: string): Promise<string[]>
    listShares(docId: string): Promise<Profile[]>
    listOwned(userId: string): Promise<DocSummary[]>      // updated_at desc
    listShared(userId: string): Promise<SharedSummary[]>  // updated_at desc
    insertDocument(ownerId: string, title: string, content: JSONContent): Promise<DocRow>
    updateIfVersion(id: string, expectedVersion: number, patch: { title?: string; content?: JSONContent }): Promise<DocRow | null>
    addShare(docId: string, userId: string): Promise<void>
    removeShare(docId: string, userId: string): Promise<void>
  }
  export function supabaseRepo(): Repo   // uses createAdminClient()
  ```
  `updateIfVersion` = `update … set …, version = expectedVersion + 1, updated_at = now() where id = $id and version = $expectedVersion returning *`; `null` when no row matched.
- `repo.memory.ts`: `memoryRepo(seed?: { profiles?: Profile[]; docs?: DocRow[]; shares?: [string, string][] }): Repo`.
- `documents.ts` (all take `repo: Repo` first):
  - `getDocumentFor(repo, id, userId): Promise<Result<{ doc: DocRow; role: Role; ownerName: string }>>`
  - `listDocumentsFor(repo, userId): Promise<{ owned: DocSummary[]; shared: SharedSummary[] }>`
  - `createDocument(repo, userId, input?: { title?: string; content?: JSONContent }): Promise<Result<DocRow>>`
  - `saveDocument(repo, userId, input: { id: string; version: number; title?: string; content?: JSONContent }): Promise<Result<{ version: number }>>`
  - Title normalization: trim; empty → `DEFAULT_TITLE`; > `TITLE_MAX` → `invalid`. Content > `CONTENT_MAX_BYTES` → `invalid`.

- [ ] **Step 1: Write failing tests** (`tests/access.test.ts`): owner → `'owner'`; shared user → `'editor'`; stranger → `null`; `canShare('editor') === false`; `canEdit(null) === false`.
- [ ] **Step 2: Write failing tests** (`tests/documents.test.ts`, using `memoryRepo` with Alice owner, Bob shared, Carol stranger):
  - `getDocumentFor` as Carol → `{ ok: false, error: 'not_found' }`
  - `saveDocument` as Bob with current version → `ok`, version `2`
  - two saves both based on version `1` → first ok, second `{ error: 'conflict' }`, stored content equals the first save
  - Bob saves after `removeShare(doc, bob)` → `not_found` *(Review Focus 2)*
  - title `'   '` → stored `'Untitled document'`; 201-char title → `invalid`
  - content of 1,000,001 bytes → `invalid`, version unchanged *(Review Focus 5)*
  - `listDocumentsFor(bob)` → owned empty, shared contains Welcome with `owner_name: 'Alice'`
- [ ] **Step 3:** Run `npm test` — FAIL (modules missing).
- [ ] **Step 4:** Implement `types.ts`, `limits.ts`, `access.ts`, `repo.memory.ts`, `documents.ts`.
- [ ] **Step 5:** Run `npm test` — PASS.
- [ ] **Step 6:** Implement `supabaseRepo()` (nested select for `listShared` owner name). Quick check via a temporary script or the Task 6 page.
- [ ] **Step 7:** Commit `feat: access rules and document service with version-checked saves`.

### Task 4: Sharing service

**Files:**
- Create: `lib/sharing.ts`
- Test: `tests/sharing.test.ts`

**Interfaces:**
- `shareDocument(repo, ownerId, docId, email): Promise<Result<Profile>>`
- `unshareDocument(repo, ownerId, docId, userId): Promise<Result<null>>`
- `listSharesFor(repo, userId, docId): Promise<Result<Profile[]>>` (owner only)
- Errors (exact messages): non-owner → `forbidden` "Only the owner can share this document"; doc missing or no access → `not_found`; unknown email → `invalid` "No user with that email"; self → `invalid` "You already own this document"; duplicate → `invalid` "Already shared with this user".

- [ ] **Step 1: Write failing tests:** Alice shares with `'  Carol@Demo.TEST '` → ok, Carol can then `getDocumentFor` *(Review Focus 3)*; Bob (editor) shares → `forbidden`; unknown email, self, duplicate → `invalid` with the messages above; Alice unshares Bob → Bob gets `not_found`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement (email `trim().toLowerCase()`). **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: owner-only sharing by email`.

### Task 5: File import

**Files:**
- Create: `lib/editor-extensions.ts`, `lib/import.ts`
- Test: `tests/import.test.ts`, `tests/fixtures/sample.docx` (small: heading, bold run, bullet list), `tests/fixtures/corrupt.docx` (random bytes)

**Interfaces:**
- `editorExtensions: Extensions` — StarterKit with heading levels `[1,2,3]` (+ Underline if Tiptap v2). Used by editor and import so stored JSON always matches.
- `fileToDocument(file: { name: string; size: number; bytes: ArrayBuffer }): Promise<Result<{ title: string; content: JSONContent }>>`
  - extension check (case-insensitive) → else `invalid` "Supports .txt, .md, .docx up to 1 MB"; size > `UPLOAD_MAX_BYTES` → same message
  - `.txt`: HTML-escape, split on blank lines → `<p>`, single newlines → `<br>`
  - `.md`: `marked.parse`
  - `.docx`: `mammoth.convertToHtml({ buffer })`; parse failure → `invalid` "Couldn't read that file"
  - HTML → JSON via `@tiptap/html` server `generateJSON(html, editorExtensions)`
  - title = filename without extension, trimmed to `TITLE_MAX`, empty → `DEFAULT_TITLE`

- [ ] **Step 1: Write failing tests:** `.md` `# Hi\n\n**bold** and - item` → first node heading level 1, a `bold` mark, a `bulletList`; `.txt` containing `<script>` → stays literal text; `notes.TXT` accepted with title `notes`; `.pdf` → `invalid`; 1,048,577 bytes → `invalid`; `sample.docx` → heading + bold present; `corrupt.docx` → `invalid` "Couldn't read that file" *(Review Focus 4)*.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: import .txt, .md, .docx into editable documents`.

### Task 6: Document list, create, upload

**Files:**
- Create: `app/docs/page.tsx`, `app/docs/actions.ts`, `components/UploadButton.tsx`
- Invoke **frontend-design** skill before building UI (Tasks 6–8): minimal, clean, page-like editor; neutral palette; one accent.

**Interfaces:**
- `createDocumentAction(): Promise<void>` → creates and `redirect('/docs/{id}')`
- `importDocumentAction(formData: FormData): Promise<{ error: string } | void>` → `fileToDocument` then `createDocument`, redirect on success
- Page: two sections `My documents` / `Shared with me` (title, relative updated time; shared rows show owner name); empty states one short line each; `New document` and `Upload` buttons; upload hint text exact from Global Constraints; buttons disabled while pending (prevents double-create).

- [ ] **Step 1:** Build page + actions using `requireUser()` and `supabaseRepo()`.
- [ ] **Step 2:** Browser check: as Bob, Welcome appears under Shared with me with "Alice"; New document opens editor route; uploading each fixture type creates a doc; `.pdf` shows the inline error.
- [ ] **Step 3:** Commit `feat: document list with create and upload`.

### Task 7: Editor, autosave, conflict UI

**Files:**
- Create: `app/docs/[id]/page.tsx`, `app/docs/[id]/actions.ts`, `components/DocEditor.tsx`, `components/Toolbar.tsx`, `components/SaveStatus.tsx`, `lib/save-queue.ts`
- Test: `tests/save-queue.test.ts`

**Interfaces:**
- `saveDocumentAction(input: { id: string; version: number; title?: string; content?: JSONContent }): Promise<Result<{ version: number }>>` — returns `unauthorized` if no session.
- `lib/save-queue.ts`:
  ```ts
  type Status = 'idle' | 'saving' | 'saved' | 'conflict' | 'error'
  export function createSaveQueue(opts: {
    initialVersion: number
    send: (patch: { title?: string; content?: JSONContent }, version: number) => Promise<Result<{ version: number }>>
    onStatus: (s: Status, message?: string) => void
  }): { push(patch: { title?: string; content?: JSONContent }): void; flush(): Promise<void> }
  ```
  One request in flight at a time; patches pushed while in flight merge (latest title, latest content) into one next request using the version returned by the previous save; on `conflict` stop sending forever; on `not_found` status `error` with message "You no longer have access to this document"; on `unauthorized` message "Your session expired. Sign in again."
- Page: server loads via `getDocumentFor` → `notFound()` on error. Shows title input, toolbar, editor, `SaveStatus`, `Share` button (owner) or `Shared by {name}` badge (editor).
- Editor: `useEditor({ extensions: editorExtensions, content, immediatelyRender: false })`; content changes debounce 1000 ms then `push({ content })`; title saves on blur/Enter via `push({ title })`; `beforeunload` warning while saving or unsaved.
- Toolbar: Bold, Italic, Underline, H1, H2, H3, Bullet list, Numbered list; `aria-pressed` reflects `editor.isActive`.
- Conflict: editor `setEditable(false)`; banner with exact message and buttons `Copy my text` (`navigator.clipboard.writeText(editor.getText())`) / `Reload latest` (`router.refresh()` then remount editor).

- [ ] **Step 1: Write failing tests** (`save-queue.test.ts`, fake `send` with controllable promises): two pushes during an in-flight save → exactly 2 sends total, second carries latest content and version `2` *(Review Focus 1)*; `conflict` response → status `conflict`, later pushes send nothing; `not_found` → status `error` with the access message.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement `save-queue.ts`. **Step 4:** Run — PASS.
- [ ] **Step 5:** Build page, editor, toolbar, status, conflict banner.
- [ ] **Step 6:** Browser check: formatting persists after refresh; rename persists; two tabs (Alice + Bob) editing Welcome → second shows conflict banner, Copy my text works, Reload latest shows the other edit; paste >1 MB → `Error` with message.
- [ ] **Step 7:** Commit `feat: rich-text editor with autosave and conflict handling`.

### Task 8: Share panel

**Files:**
- Create: `components/SharePanel.tsx`; Modify: `app/docs/[id]/actions.ts`, `app/docs/[id]/page.tsx`

**Interfaces:**
- `shareAction(docId: string, email: string): Promise<Result<Profile>>`, `unshareAction(docId: string, userId: string): Promise<Result<null>>`, `listSharesAction(docId)`.
- Panel (owner only): people with access (name + email, Remove), email input + Add, inline error from `Result.message`; hint listing demo emails.

- [ ] **Step 1:** Build actions + panel.
- [ ] **Step 2:** Browser check: Alice shares a new doc with Carol → Carol sees it under Shared with me and can edit; Remove → Carol's open tab save shows the access message; Bob sees no Share button on Welcome.
- [ ] **Step 3:** Commit `feat: share panel`.

### Task 9: Keep-alive + deploy

**Files:**
- Create: `app/api/health/route.ts`, `vercel.json`

**Interfaces:**
- `GET /api/health` → runs `select id from profiles limit 1` via admin client → `200 { ok: true }` or `503 { ok: false }`.
- `vercel.json`: `{ "crons": [{ "path": "/api/health", "schedule": "0 12 * * *" }] }`

- [ ] **Step 1:** Implement; `curl localhost:3000/api/health` → `{"ok":true}`.
- [ ] **Step 2:** Owner runs `npx vercel login` once. Then `npx vercel link` (project `ajaia-docs`), add the 4 env vars for Production via `npx vercel env add`, `npx vercel --prod`.
- [ ] **Step 3:** Smoke test the live URL with Playwright: demo sign-in → create → format → refresh persists → share → switch user → visible; `/api/health` 200. Screenshot each step into `docs/screenshots/`.
- [ ] **Step 4:** Commit `chore: health check, cron, deploy config`.

### Task 10: Submission docs

**Files:**
- Create/replace: `README.md`, `ARCHITECTURE.md`, `AI_WORKFLOW.md`, `SUBMISSION.md`, `VIDEO_URL.txt`

Each is short; no padding.
- `README.md`: live URL, demo accounts + `DEMO_PASSWORD` value, local setup (clone, `npm i`, `.env.local` from `.env.example`, apply `supabase/migrations/0001_init.sql`, `npm run seed`, `npm run dev`, `npm test`), supported upload types and limit, note that reviewers share one database, what's cut (table from spec).
- `ARCHITECTURE.md`: diagram (browser → Next.js server actions → service layer → Repo → Supabase), why each decision (server-only data access, Repo for testability, optimistic locking, Tiptap JSON, no Redis/realtime), tradeoffs.
- `AI_WORKFLOW.md`: tools (Claude Code + superpowers skills, subagent builder check, Supabase/GitHub/Playwright MCP); where AI sped up; what was changed or rejected (owner fills real examples from this build — e.g. Redis and live co-editing cut, conflict handling tightened after review, read-only DB access scoped per repo); verification (unit tests, browser checks, Playwright smoke on prod).
- `SUBMISSION.md`: exact file list, live URL, video URL, demo credentials, what works / incomplete / next 2–4 hours (live presence indicators, version history, delete docs, RLS policies as defense in depth).
- `VIDEO_URL.txt`: placeholder line for the owner's link.

- [ ] **Step 1:** Write the five files. **Step 2:** `npm test && npm run build` pass. **Step 3:** Commit `docs: README, architecture, AI workflow, submission`.

---

## Live editing (added 2026-11-05 — run before Task 9's deploy steps)

Spec: "Addendum: live co-editing". Tiptap v3: use `@tiptap/extension-collaboration` and `@tiptap/extension-collaboration-caret` with `yjs` + `y-protocols` (awareness); server-side JSON↔Yjs via the Tiptap/y-prosemirror helpers the installed versions export (e.g. `prosemirrorJSONToYDoc` / `yXmlFragmentToProsemirrorJSON` — confirm in node_modules). Yjs fragment name: `default`. StarterKit's undo/redo must be disabled when Collaboration is on.

### Task 11: Yjs state on the server

**Files:**
- Create: `supabase/migrations/0002_ydoc.sql`, `lib/ydoc.ts`, `lib/live.ts`
- Modify: `lib/types.ts` (DocRow gains `ydoc: string | null`), `lib/repo.ts`, `lib/repo.supabase.ts`, `lib/repo.memory.ts`
- Test: `tests/ydoc.test.ts`, `tests/live.test.ts`

**Interfaces:**
- Migration: `alter table documents add column ydoc text;`
- `repo.updateIfVersion` patch accepts `ydoc?: string`; new `repo.setYdocIfNull(id, ydoc): Promise<DocRow | null>` (update … where id and ydoc is null returning *).
- `lib/ydoc.ts` (pure, client-safe except where noted):
  - `jsonToYState(content: JSONContent): Uint8Array`
  - `yStateToJson(state: Uint8Array): JSONContent`
  - `mergeStates(states: Uint8Array[]): Uint8Array` (Y.mergeUpdates)
  - `toB64(u: Uint8Array): string`, `fromB64(s: string): Uint8Array`
- `lib/live.ts` (services, take `repo` first):
  - `openLiveDocument(repo, id, userId): Promise<Result<{ doc: DocRow; role: Role; ownerName: string; ydoc: string }>>` — access via `accessFor`; if `doc.ydoc` null → `setYdocIfNull(id, toB64(jsonToYState(doc.content)))`, on null result re-read.
  - `saveLiveUpdate(repo, userId, { id, update: string }): Promise<Result<{ version: number }>>` — access check (not_found), merge stored+incoming, derive content, `CONTENT_MAX_BYTES` → invalid, `updateIfVersion` with retry ×3 on conflict, then `conflict` only if all retries fail.
  - `saveTitle(repo, userId, { id, title }): Promise<Result<{ title: string }>>` — access check, normalize like saveDocument, write without version check (last write wins; still bumps version).

- [ ] **Step 1: failing tests** — `ydoc.test.ts`: JSON → Y → JSON round-trip keeps heading, bold, bulletList; two Y.Docs from the same base state each insert different text, `mergeStates` of base + both updates → JSON contains both insertions exactly once; merging the same update twice is idempotent. `live.test.ts` (memoryRepo): stranger `openLiveDocument` → not_found; first open sets ydoc, second open returns the same ydoc; `saveLiveUpdate` from two clients based on the same state → stored content has both edits; repo whose `updateIfVersion` returns null once then succeeds → ok (retry); oversize merged content → invalid; `saveTitle` blank → `Untitled document`.
- [ ] **Step 2:** run — FAIL. **Step 3:** implement. **Step 4:** run — PASS; tsc clean.
- [ ] **Step 5:** commit `feat: Yjs document state with merge-on-save`. (Controller applies migration 0002.)

### Task 12: Realtime channel access + client provider

**Files:**
- Create: `supabase/migrations/0003_realtime_access.sql`, `lib/supabase/browser.ts`, `lib/live-provider.ts`
- Test: `tests/live-provider.test.ts`

**Interfaces:**
- Migration: SQL function `public.can_access_doc(doc uuid) returns boolean` (security definer, `search_path = public`; true if `auth.uid()` owns `doc` or has a share row). RLS on `realtime.messages`: `select` and `insert` for `authenticated` where `realtime.messages.extension = 'broadcast'` and `realtime.topic() like 'doc:%'` and `can_access_doc(substring(realtime.topic() from 5)::uuid)` (guard the cast: only when the suffix is a UUID).
- `lib/supabase/browser.ts`: `createBrowserSupabase(): SupabaseClient` (`@supabase/ssr` createBrowserClient, anon key).
- `lib/live-provider.ts`:
  ```ts
  export function createLiveProvider(opts: {
    channel: LiveChannel            // thin wrapper: send(event, payload), on(event, cb), subscribe(cb), unsubscribe()
    ydoc: Y.Doc
    awareness: Awareness
    onPeers?: (names: string[]) => void
  }): { destroy(): void }
  export function supabaseLiveChannel(client: SupabaseClient, docId: string): LiveChannel  // private: true, broadcast self: false
  ```
  - local Y updates (origin ≠ provider) → `send('update', { u: b64 })`; incoming `update` → `Y.applyUpdate(ydoc, …, provider)`
  - on subscribed → `send('sync', { sv: b64(stateVector) })`; incoming `sync` → reply `update` with `Y.encodeStateAsUpdate(ydoc, sv)`
  - awareness changes → `send('awareness', …)`; incoming → `applyAwarenessUpdate`; `onPeers` with other users' names
  - `destroy()` removes listeners, marks local awareness offline, unsubscribes

- [ ] **Step 1: failing tests** with an in-memory `LiveChannel` pair/bus: edits in doc A appear in doc B; a late joiner C syncs full state via `sync`; awareness names reach `onPeers`; after `destroy()` no more sends.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat: Yjs relay over Supabase Realtime with channel access rules`. (Controller applies migration 0003 and verifies a stranger can't join.)

### Task 13: Live editor

**Files:**
- Modify: `app/docs/[id]/page.tsx`, `app/docs/[id]/actions.ts`, `components/DocEditor.tsx`, `components/SaveStatus.tsx`
- Create: `components/Presence.tsx`
- Remove or stop using: the content conflict banner path and `lib/save-queue.ts` content saving (title may keep using a small queue or direct action)

**Interfaces:**
- Page loads via `openLiveDocument`; passes `ydoc` (b64), `role`, `ownerName`, user `{ id, name }`. Drop `key={doc.version}` remount.
- Actions: `saveLiveUpdateAction({ id, update })`, `saveTitleAction({ id, title })` → `unauthorized` without session.
- Editor: `new Y.Doc()` + `applyUpdate(fromB64(ydoc))`; extensions = `editorExtensions` (StarterKit undoRedo off) + `Collaboration.configure({ document: ydoc, field: 'default' })` + `CollaborationCaret.configure({ provider-compatible awareness, user: { name, color } })` (color derived from user id). Provider from Task 12 on `doc:{id}`.
- Saving: collect local-origin updates; 1000 ms after the last one, send `mergeStates(pending)` via `saveLiveUpdateAction`; keep on failure and resend on next flush; flush on Back link/unmount; `beforeunload` while pending. Status: `Saving…` / `Saved` / `Error` (no `Conflict` for content).
- not_found / unauthorized → editor read-only + existing messages, provider destroyed.
- Title: save on blur/Enter via `saveTitleAction`; broadcast `title` on the channel; incoming `title` updates the field if not focused.
- Presence line in the toolbar: `Editing: {names}` (others only; hidden when alone).

- [ ] **Step 1:** build; `npm test`, tsc, lint pass (update/remove tests tied to retired code).
- [ ] **Step 2: live check** with two browser contexts (Alice + Bob on Welcome): typing in one appears in the other within ~1 s; both carets with names; presence line; both reload → identical content (persisted); Bob unshared → his save shows the access message; title rename appears in the other tab.
- [ ] **Step 3:** commit `feat: live co-editing with carets and presence`.
