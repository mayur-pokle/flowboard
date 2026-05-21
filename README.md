# Flowboard

AI-powered content opportunity engine with a Trello-style Kanban board, shared across your team.

Generate weekly batches of high-leverage content ideas (calculators, templates, guides, whitepapers, checklists, frameworks), filter the ones worth executing, and produce 1000+ word SEO-optimized drafts with structured data, FAQs, and meta — all on a single page that everyone on your team sees.

## What's inside

- **Sign in** — Email magic links via NextAuth. Allowlist of teammates lives in `lib/allowlist.ts` (or `ALLOWED_EMAILS` env var).
- **Ideas** — AI-generated topic batches with priority scores, search intent, competitor gaps, and CTAs. Move ideas to the board or delete them (deleted ideas are remembered and never re-shown). Shared across all signed-in teammates.
- **Kanban** — Three-column drag-and-drop board (To Do / In Progress / Done). Cards open a detail panel with full SEO and content controls. Real-time-ish: refresh to see teammates' changes.
- **Content generation** — When a card hits the board, Flowboard auto-generates a publish-ready article with H1/H2/H3, internal-link suggestions, CTA placements, JSON-LD schema, and FAQs.
- **Settings** — Edit your shared brand profile, competitors, model picks, and seed keywords. AI provider keys and Slack webhook are managed via Vercel env vars (server-side).
- **Weekly automation** — Vercel cron generates fresh topics every Monday at 14:00 UTC and posts them to Slack.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- **Vercel Postgres (Neon)** + Drizzle ORM for shared state
- **NextAuth v4** with email magic links (Resend SMTP)
- Zustand for in-memory client state, API-backed (no more localStorage as source of truth)
- `@dnd-kit` for Kanban drag-and-drop
- OpenAI (`gpt-4o-mini` default) and Gemini (`gemini-1.5-flash-latest` default) with mock fallback
- Vercel cron for the weekly job

Single deployable on Vercel. Database, auth, AI, and cron all run in the same project.

## Deploying from scratch (~15 minutes)

### 1. Push the code to GitHub

```bash
cd ~/Desktop/Flowboard
git init && git add . && git commit -m "Initial commit"
gh repo create flowboard --private --source=. --push
```

(or push to a repo you've already created)

### 2. Import to Vercel

- Go to <https://vercel.com/new>
- Import the GitHub repo
- Keep the defaults; **don't deploy yet** — we need to attach the database first

### 3. Provision Vercel Postgres

- In the new project, go to **Storage** → **Create Database** → **Postgres**
- Click **Connect Project** — Vercel auto-injects `POSTGRES_URL` and friends into the env
- Copy the connection string to your local `.env.local`

### 4. Push the database schema

From your local machine, with `POSTGRES_URL` in `.env.local`:

```bash
npm install
npm run db:push
```

This creates all tables (users, accounts, sessions, topics, tasks, settings, competitors, etc.).

### 5. Set up Resend for magic-link emails

- Sign up at <https://resend.com> (free tier: 100 emails/day, 3000/month)
- For testing, you can use the verified sender `onboarding@resend.dev` (limited to your own email)
- For production, verify your domain (e.g. `zeni.ai`) and create a sender like `flowboard@zeni.ai`
- Create an API key under **API Keys** → copy it

### 6. Configure environment variables in Vercel

Project → Settings → Environment Variables. Add:

| Variable | Example / how to get it |
| --- | --- |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your deployment URL, e.g. `https://flowboard.vercel.app` |
| `EMAIL_SERVER_HOST` | `smtp.resend.com` |
| `EMAIL_SERVER_PORT` | `465` |
| `EMAIL_SERVER_USER` | `resend` |
| `EMAIL_SERVER_PASSWORD` | `re_…` (your Resend API key) |
| `EMAIL_FROM` | `Flowboard <onboarding@resend.dev>` (or your verified domain) |
| `ALLOWED_EMAILS` | (optional) extra allowlisted emails, comma-separated |
| `OPENAI_API_KEY` | (optional) `sk-…` for live AI |
| `OPENAI_MODEL` | (optional) override default `gpt-4o-mini` |
| `GEMINI_API_KEY` | (optional) `AIza…` |
| `GEMINI_MODEL` | (optional) override default `gemini-1.5-flash-latest` |
| `SLACK_WEBHOOK_URL` | (optional) for the weekly digest |
| `CRON_SECRET` | (optional) long random string protecting `/api/cron/weekly` |
| `BRAND_*` | (optional) fallback brand context |

`POSTGRES_*` vars are auto-set when you connect the database.

### 7. Deploy

Click **Deploy** in Vercel (or push to main). The build will succeed; the first sign-in will create a user row and provision an empty workspace.

### 8. Add teammates

Edit `lib/allowlist.ts` and append the email, or just add the email to the `ALLOWED_EMAILS` env var in Vercel (no redeploy needed). Teammates can then sign in with their email — Flowboard sends them a magic link, and once they click, they're in the same shared workspace as everyone else.

## Local development

```bash
cp .env.example .env.local   # fill in POSTGRES_URL + Email + NEXTAUTH_SECRET at minimum
npm install
npm run db:push              # one-time schema setup
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/sign-in`. Enter an allowlisted email — check your Resend dashboard (or your inbox if you have a verified domain) for the magic link.

## Data model

All shared state lives in Postgres (see `db/schema.ts`). The Zustand store in `lib/store.ts` is an in-memory mirror that:

- Hydrates from the DB on app load (after sign-in)
- Optimistically updates the UI on mutations
- Writes through to the API
- Reverts on error

No `localStorage` persistence anymore — the only thing in `localStorage` is a one-shot flag (`flowboard.migrated_to_db`) so the legacy → DB migration doesn't re-run.

### Tables

| Table | Purpose |
| --- | --- |
| `users`, `accounts`, `sessions`, `verificationTokens` | NextAuth |
| `topics` | The Ideas pool |
| `deletedTopicHashes` | "Never show again" memory |
| `movedTopicHashes` | Topics already moved to the board |
| `tasks` | Kanban cards (with embedded topic snapshot + generated content) |
| `settings` | Singleton row keyed `workspace` |
| `competitors` | Rows of competitor name/URL/notes |
| `meta` | Misc flags (currently just the migration sentinel) |

## API routes

All routes are gated by NextAuth session.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | * | NextAuth handler |
| `/api/topics` | GET, POST | List / bulk-insert topics |
| `/api/topics/:id` | DELETE | Remove + remember hash |
| `/api/topics/:id/move-to-board` | POST | Move to Kanban as a task |
| `/api/tasks` | GET | List all tasks |
| `/api/tasks/:id` | PATCH, DELETE | Update status/priority/tags/content; delete |
| `/api/settings` | GET, PATCH | Get / update shared brand profile |
| `/api/competitors` | POST | Add competitor |
| `/api/competitors/:id` | PATCH, DELETE | Edit / remove |
| `/api/generate-topics` | POST | AI topic batch |
| `/api/generate-content` | POST | AI article |
| `/api/slack/notify` | POST | Manual Slack post |
| `/api/cron/weekly` | GET | Weekly cron (uses `CRON_SECRET`) |
| `/api/migrate` | GET, POST | One-time browser → DB migration |

## Scripts

```bash
npm run dev         # local dev
npm run build       # production build
npm run start       # serve production build
npm run typecheck   # tsc --noEmit
npm run db:push     # apply schema changes to the connected DB
npm run db:studio   # open Drizzle Studio (browse / edit tables locally)
```

## Security caveats

- AI keys and Slack webhook are server env vars only — never sent to the client.
- The allowlist is enforced both at NextAuth sign-in (rejects unknown emails) and on every API route (rejects requests without a valid session).
- This is still a v1 internal tool. For external exposure, consider: rate-limiting the AI endpoints, encrypting per-user fields, audit logging of who deleted what, etc.

## License

MIT
