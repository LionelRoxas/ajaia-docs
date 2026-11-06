# Architecture

```
Browser (Tiptap + Yjs)
  |-- server actions --> Next.js (Vercel) --> services --> Repo --> Postgres
  |                      (session -> user)    (access rules) (supabase | memory)
  '-- Supabase Realtime, private channel  doc:{id}:{epoch}   (relay only)
        Yjs updates, carets/presence, sync requests, title hints
```

- Services (`lib/documents.ts`, `sharing.ts`, `live.ts`, `import.ts`) hold the logic. `lib/access.ts` is the single place that decides who can do what.
- `Repo` is an interface with two implementations: Supabase, and an in-memory one used by tests.

## Key decisions

| Decision | Why |
|---|---|
| All data access is server-side; the browser only holds auth cookies. RLS is on with no table policies. | One place enforces access; the public key can read nothing. |
| `Repo` interface + `memoryRepo` | Business rules are tested fast, without a database. |
| Yjs CRDT, not Google's operational transform | OT needs a central always-on transform server, and Vercel cannot hold connections. A CRDT merges anywhere, so Supabase only relays and Postgres stores. |
| Save = merge into stored Yjs state, then compact | Merges are idempotent, so retries and duplicates are safe. Compaction drops deleted text. Caps: 2 MB state, 1 MB derived content. Malformed updates, or ones that reference missing data, are rejected. |
| Share epoch in the channel name (`doc:{id}:{epoch}`) | Unsharing bumps the epoch and tells peers to rejoin on the new topic; the removed user cannot follow. |
| RLS on `realtime.messages` | Only the owner or a shared user, at the current epoch, can join or send on a doc channel. Checked in SQL as each user. |
| Demo auth on real Supabase Auth | Same code path as real users; the one-click buttons just sign in server-side. |
| `content` JSON kept beside `ydoc` | The list, import and fallback do not need to decode Yjs. |
| Version-checked writes on save | A save writes only if the row is unchanged since read, retrying a few times, so concurrent saves cannot overwrite each other. |
| No Redis | Not needed at this scale. |

## Known limitations

| Limitation | Production fix |
|---|---|
| Title is last-write-wins; peers refetch it from the server after a hint. | Make the title part of the Yjs doc. |
| A removed user may see a few seconds of edits before peers rekey. | Short-lived auth tokens so channel access is rechecked often. |
| Presence names and caret colors come from the client, so a collaborator can fake them. | Bind presence to the signed-in identity. |
| Sign-up skips email verification (demo choice). | Supabase sign-up with confirmation and rate limiting. |
| "No user with that email" tells an owner whether an account exists. | Invite flow with a generic reply. |
| Reviewers share one database. | Per-reviewer or per-tenant data. |
| A crafted `.docx` can expand a lot when unzipped; the 1 MB cap is on the compressed file only. Not yet fixed. | Check unzipped size before converting. |
| No offline support. | Persist the Yjs doc locally (IndexedDB). |
