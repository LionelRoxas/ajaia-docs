# Review Log

How each change was checked before it was accepted, what the checks caught, and what I decided.

## Process

- Each task was built by a fresh AI implementer from a written brief, then sent through an **independent AI review gate** (spec compliance + code quality) that saw only the brief and the diff.
- Anything Critical or Important blocked the task until fixed and re-reviewed. Minor items were logged and triaged at the end.
- An automated security review ran on every commit.
- I live-tested features on a local dev server as they landed.
- Scope and security trade-offs were my calls; they're listed at the bottom.

## Blocking issues found and fixed

| # | Area | Problem | Fix | Proof |
|---|---|---|---|---|
| 1 | Auth | A signed-in user with no profile row looped forever between `/` and `/docs`. | Profile falls back to the auth user's id, email and name. | Deleted a profile row, reloaded: no loop. |
| 2 | Auth form | Switching to sign-up while a sign-in was in flight showed a stale error. | Toggle and demo buttons disabled while pending; error cleared on each attempt. | Browser check. |
| 3 | Auth form | A failed sign-in wiped what the user typed. | Form submit no longer resets fields. | Browser check. |
| 4 | Sign-up | Any 422 from Supabase was reported as "account already exists" (e.g. a weak password). | Match on the `email_exists` error code only. | Live duplicate-email check. |
| 5 | Documents | A malformed URL like `/docs/abc` caused a 500 instead of a 404. | Ids that aren't UUIDs return not found before touching the database. | Test with a repo that throws like Postgres; fails if the guard is removed. |
| 6 | Sign-in redirect | Open redirect: `/?next=/%09/evil.com` sent users to another site (browsers strip tabs/newlines). | Reject control characters and backslashes, then require the parsed URL to stay on our origin. | Tests for `\t`, `\n`, `\r`, `%09`, NUL; live redirect now goes to `/docs`. |
| 7 | Autosave | An edit that failed on the network was dropped if the user navigated away in-app. | Flushing resends kept work; called on back-navigation and unmount. | Test: failed send → flush → kept edit resent. |
| 8 | Autosave | A rare timing gap meant an edit right after a save finished never started a save. | "Busy" flag cleared inside the save loop. | Test that hits the exact window. |
| 9 | Live saves | Stored Yjs state grew without limit and kept deleted text forever. | Size caps (2 MB state, 1 MB content); merged state is compacted by re-encoding it. | Tests for oversize updates and compaction. |
| 10 | Live saves | A document with no stored Yjs state, or a lost first-open race, could be saved over. | Missing base returns a conflict; first-open conversion only writes where `ydoc is null`. | Null-state, exactly-once, idempotent, race-loser and malformed-update tests. |
| 11 | Live saves | An update referencing data the server does not have was accepted and could be silently dropped. | Reject updates with pending structs/deletes, or shared types other than `default`. | Test written red first, then fixed. |
| 12 | Live access | After unshare, the removed user kept reading (via sync replies) and writing (via peers' saves) until reconnect. | Per-document share epoch: channel `doc:{id}:{epoch}`, RLS checks the current epoch, unshare bumps it and peers rejoin. | `can_join_doc` checked as each user (Bob at old epoch true, new epoch false; Carol false). |
| 13 | Live access | Rekey depended on the owner's browser being on the doc; unsharing from elsewhere left everyone on the old topic. | Unshare also broadcasts the rekey from the server; save responses carry the current epoch so clients rejoin. | Live: unshared from a separate tab, Bob cut off in 2-2.5 s. |
| 14 | Live title | A peer could push any title to others over the channel. | Title broadcast is only a hint; peers fetch the title from the server, applied on blur. | Browser check. |
| 15 | Live carets | Caret color came from the client unchecked. | Validated against the palette. | `caret-colors` tests. |
| 16 | Live sync | Missing-data updates could loop resyncs; status stayed "ready" after channel errors; handlers could throw. | Resync throttled to 1.5 s; status resets on channel error/timeout/close; safe incoming handlers; goodbye on page hide. | Provider tests. |
| 17 | Live title | Title saver kept retrying after access was lost. | Stops on not-found / unauthorized and the editor goes read-only. | Browser check. |

## Non-blocking fixes made along the way

- Clipboard failure on **Copy my text** shows an inline message instead of failing silently.
- Leave-page warning works in older browsers too.
- In-memory test repository deep-copies data so tests can't pass by accident.
- Removed non-default Next.js flags that would have broken cookie-based auth pages.
- Tailwind moved to the standard PostCSS setup after styles risked not rendering.

## Security review findings and my decisions

| Finding | Decision |
|---|---|
| Sign-up skips email verification. | **Accepted for the demo.** Verification would block reviewers. Production: Supabase sign-up with confirmation and rate limiting. |
| Share box says "No user with that email" (lets owners check if an account exists). | **Accepted.** Only signed-in owners see it; needed for usable sharing. Production: invite flow with a generic reply. |
| A small `.docx` could expand hugely when unzipped. | **Open.** Bounded to one function invocation; planned fix is to check unzipped size before converting. Listed as a known limitation. |
| Open redirect in `next`. | **Fixed** (row 6). |
| Yjs: unbounded stored state, deleted text kept (Task 11). | **Fixed** (rows 9, 11). Rebuilding state from JSON was **rejected**: it breaks CRDT identity for connected clients. |
| Unshared user keeps receiving and, via peers' saves, writing (Task 12-13, rated High). | **Fixed** with share-epoch rotation and server-side rekey (rows 12-13). I first meant to document it; the review showed it was wider than the spec said. |
| Presence name spoofing between collaborators. | **Accepted.** Only authorized collaborators can send; worst case is a fake caret name. Production: bind to identity. |
| Private channels need Realtime "Allow public access" off. | **Owner step**, in the README; confirm and test a public join is refused before deploy. |
| Concurrent unshares could rekey the wrong topic (low impact; peers still catch up from save responses). | **Open.** Planned: atomic epoch bump returning the old value. |

## Verified safe (no change needed)

- Uploaded `.md`/`.docx` can't store scripts, event handlers or `javascript:` links; everything is filtered through the editor's schema. Pinned with a test.
- The service-role key never reaches the browser bundle.
- Strangers get 404 for docs they can't access; existence isn't revealed.
- Saves use a single atomic `UPDATE … WHERE version = n`; no read-then-write race.
- Realtime policies check the owner, the share, and the epoch; a stranger (Carol on Welcome) is refused at join.

## Scope calls I made

- Cut Redis. Live co-editing was first cut, then added back before deploy as Yjs over Supabase Realtime, which removed content conflicts.
- Chose a CRDT over Google's operational transform: Vercel cannot host the always-on server OT needs.
- Added real auth on top of one-click demo accounts.
- Deferred share-notification emails (demo inboxes aren't real; would need a verified sending domain) and built return-to-doc after sign-in instead.

## Still open (minor, logged)

- Atomic unshare + epoch bump in one SQL function; rejoin only when the epoch increases.
- `.docx` unzipped-size check.
- Title hint is bounded but not rate-limited; self-heal retries every 1.5 s indefinitely.
- Stuck-pending saves give a generic message until resync; unmount flush failure is silent.
