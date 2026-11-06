# AI workflow

## Tools

- **Claude Code** with the superpowers skills: brainstorming, a written spec, a written plan, then subagent-driven development. Each task was built by a fresh AI implementer, then checked by a separate AI review gate that saw only the brief and the diff.
- An automated security review on every commit.
- Supabase, GitHub and Playwright MCP servers. Features were also checked live in a browser on a local dev server.

## Where AI sped things up

- Drafting the spec and plan, then building tasks from the plan.
- Boilerplate: repo layer, server actions, test scaffolding, the Tiptap/Yjs wiring.
- Review: a second pass on every task caught bugs that would have slipped through at this pace.

## What I changed or rejected

- **Scope cuts.** I cut Redis, and email notifications on share (no real inboxes; needs a verified domain). I added return-to-document-after-sign-in instead.
- **A wrong ruling, corrected.** A controller ruling specified a weak `next` redirect check. The security review showed `/\t/evil.com` bypasses it (browsers strip the tab). The rule was replaced with control-character rejection plus an origin check, with tests.
- **Security suggestion rejected.** To drop deleted text from stored Yjs state, one finding suggested rebuilding the state from JSON. I rejected that: it breaks CRDT identity for connected clients. We compact by re-encoding the merged state instead.
- **Reviewer-endorsed deviation.** The implementer made saves send everything since the last confirmed save, including peers' edits, not just local ones. The reviewer approved it.
- **A provisional ruling superseded.** I first planned to document "an unshared user keeps access until reconnect". The security review showed they could also write through peers' saves. We built share-epoch channel rotation and a server-side rekey instead.
- **Plan gaps caught before building.** Shared types needed to move earlier in the plan, and no tool could change auth settings, so sign-up uses the admin API.

Full list of blocking findings and decisions: [docs/REVIEW_LOG.md](docs/REVIEW_LOG.md).

## How correctness, UX and reliability were verified

- **Correctness.** Test-first (red, then green). 111 unit tests: access rules, saves, import (including script stripping), Yjs merge and caps, epoch and revocation, redirect safety.
- **UX.** Live checks in two browsers: typing, carets, presence, share and unshare, upload, reload persistence.
- **Reliability.** Tests for failed saves resending, an autosave timing gap, and reconnect/resync. SQL policy checks run as each user (owner, shared user, stranger, old epoch). Revocation was checked live from a separate tab.
