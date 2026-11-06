# Ajaia Docs

A small Google Docs-style editor: rich text, autosave, file import, sharing, and live co-editing with carets and presence.
Next.js + TypeScript, Supabase (Postgres, Auth, Realtime), deployed on Vercel.

**Live:** https://ajaia-docs-lac-psi.vercel.app

## Demo accounts

| Name | Email |
|---|---|
| Alice | alice@demo.test |
| Bob | bob@demo.test |
| Carol | carol@demo.test |

Click **Continue as Alice / Bob / Carol** on the sign-in page. To sign in by hand, the shared password for all three is `Demo-_Q2oYBHe` (demo-only). You can also sign up with any email and password.

## Quick tour (about 3 minutes)

1. Continue as **Alice**. Open **Welcome** (already shared with Bob).
2. In a second browser or an incognito window, continue as **Bob** and open the same document.
3. Type in both windows: text appears live, each person has a named, colored caret, and "Editing: ..." shows who is here.
4. As Alice, use **Share** to add `carol@demo.test`, then remove Bob. Bob's window is cut off within a few seconds.
5. **New document**, then format with B / I / U, H1-H3, bullet and numbered lists. Rename by clicking the title. Reload: everything is saved.
6. **Upload** a `.txt`, `.md` or `.docx` file to create a new document from it.
7. Sign in as Carol: **Shared with me** lists documents shared to her, with the owner's name.

## Uploads

`.txt`, `.md`, `.docx`, up to 1 MB. Unsupported formatting is dropped; scripts and unsafe links are stripped.

## Run locally

Needs Node 20+ and a free [Supabase](https://supabase.com) project.

```bash
git clone <repo-url> && cd ajaia-docs
npm install
cp .env.example .env.local     # fill in the four values below
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings, API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page (anon / publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | same page (server only, never sent to the browser) |
| `DEMO_PASSWORD` | any password; used for the three demo accounts |

Then:

1. In the Supabase SQL editor, run `supabase/migrations/0001_init.sql`, `0002_ydoc.sql`, `0003_realtime_access.sql`, `0004_share_epoch.sql`, `0005_unshare_atomic.sql`, in that order.
2. In Supabase Realtime settings, turn off "Allow public access" so only the private-channel policies apply.
3. `npm run seed` creates Alice, Bob, Carol and the Welcome document (safe to re-run).
4. `npm run dev`, then open http://localhost:3000.
5. `npm test` runs the unit tests (no database needed; they use an in-memory repo).

## CI / deploy

- GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, tests and a production build on every push to `main` and every pull request.
- Vercel deploys `main` to production automatically; pull requests get preview deployments.

## Notes for reviewers

- **Everyone shares one database.** You may see documents other reviewers made. There is no reset.
- A daily Vercel cron calls `/api/health` so the free Supabase project does not pause.

## Deliberately cut

| Cut | Why |
|---|---|
| Redis / caching | Nothing at this scale needs it. |
| Email notifications on share | Demo inboxes are not real; needs a verified sending domain. Shared docs show under "Shared with me" instead. |
| Password reset, OAuth, email verification | Not needed to show the core flow. |
| Roles beyond owner / editor | One access level keeps the rules obvious. |
| Delete documents, version history, comments, export | Stretch items. |
| Images and attachments in documents | Upload covers import. |

More: [ARCHITECTURE.md](ARCHITECTURE.md) (design, known limitations), [AI_WORKFLOW.md](AI_WORKFLOW.md), [docs/REVIEW_LOG.md](docs/REVIEW_LOG.md), [SUBMISSION.md](SUBMISSION.md).
