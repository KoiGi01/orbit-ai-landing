# Repository guidance

> **Start here:** read `docs/CLAUDE_CODE_HANDOFF_2026-08-26.md` before making changes. It is the current verified handoff for production state, architecture, pending integrations, and next checkpoints. Older planning documents (including earlier dated handoffs) may describe superseded assumptions.

## Product

AutiveX is a Spanish-first voice receptionist platform for businesses in Mexico. The public landing page demonstrates the product, while the Clerk-protected dashboard supports prospects, manually activated clients, and internal operators.

Retell AI is the only voice provider in this repository. Do not add another voice transport, client SDK, token endpoint, or fallback demo unless the product owner explicitly changes that decision.

## Stack

- React 19 and Vite 7
- Plain JavaScript modules
- Custom CSS and Lucide React icons
- Clerk for authentication and access control
- Retell AI web SDK for browser voice calls
- Node's built-in HTTP server for local API and production static serving
- Vercel-compatible functions under `api/`
- Postgres accessed only by server modules through `lib/server/database.js`

## Entrypoints

- Public landing: `index.html` -> `src/landing.jsx` and `src/landing.css`
- Dashboard: `dashboard/index.html` -> `dashboard/src/main.jsx`
- Local API: `server/index.js`
- Shared server modules: `lib/server/`

Do not infer an active frontend from an old filename. Confirm the relevant `index.html` entrypoint before changing UI code.

In production, `vercel.json` rewrites `/sign-in`, `/sign-up`, `/accept-invitation`, `/onboarding`, `/app`, `/admin`, and `/internal` (plus their subpaths) to `dashboard.html`; everything else falls through to the landing build. `npm run build:platform` is what produces that combined `dist/` output and is the command Vercel actually runs.

## Voice architecture

Both the landing and the eligible dashboard workspace use `retell-client-js-sdk`. They POST the selected scenario to `/api/retell/token`, receive a short-lived `access_token`, and start a browser call with `RetellWebClient`.

Server-controlled scenario variables and agent-version validation live in `lib/server/retell-demo.js`. The API implementation exists in both `api/retell/token.js` and the local server route in `server/index.js`; keep their observable behavior aligned.

The Retell API key and agent IDs are server-only. Never expose them through `VITE_` variables, browser bundles, logs, screenshots, or JSON responses. Do not persist access tokens.

## Commands

```bash
npm install
npm run dev              # landing + local API
npm run dev:control      # dashboard + local API
npm run dev:web          # landing only
npm run dev:dashboard    # dashboard only
npm run dev:server       # API only
npm test                 # node --test (all files in test/)
node --test test/retell-provisioning.test.js  # run a single test file
# tests need no live database or network: they boot an in-memory Postgres via
# @electric-sql/pglite and apply every file in supabase/migrations/ before asserting
npm run build
npm run build:dashboard
npm run build:platform    # builds both apps into dist/; this is Vercel's buildCommand
npm start                # API and built landing
```

## Environment

Use `.env.example` as the source of truth for server configuration and `dashboard/.env.example` for browser-safe Clerk configuration. Important server groups are:

- `RETELL_*` for voice agents and pinned versions
- `CLERK_*` and `AUTIVEX_ADMIN_*` for authentication and internal access
- `LEAD_WEBHOOK_*` or `RESEND_*` for lead delivery
- `AUTIVEX_PUBLIC_ORIGINS` and rate limits for public endpoint protection
- `DATABASE_URL` or Vercel's Supabase-provided `POSTGRES_URL` for the server-only CRM database; never create a `VITE_` database variable
- `RETELL_CALENDAR_WEBHOOK_URL` and `AUTIVEX_APPOINTMENTS_WEBHOOK_SECRET` for the n8n-mediated Google Calendar booking and read flow (see the handoff for how n8n resolves and writes to a client's calendar)

## Persistent data

The canonical schema lives in `supabase/migrations/`. Run `npm run db:migrate` to apply pending migrations and `npm run db:seed:mvp` to bind the first Clerk organization to its Retell agent.

The repository is linked locally to the hosted Supabase and Vercel projects. Link metadata under `supabase/.temp/` and `.vercel/` is intentionally ignored. Create every schema change as a new Supabase migration, inspect it with `supabase db push --linked --dry-run`, and only then push it. Do not make untracked structural changes in the production SQL Editor.

Clerk owns identity, memberships, and organization roles. Postgres owns CRM activity, voice-agent bindings, webhook idempotency, appointment and notification records, and integration connection state. Every operational query must resolve and filter by the active Clerk organization; never trust a workspace ID supplied by browser input.

The `app` Postgres schema is private and has no browser role grants. OAuth credentials are represented only by `credential_ref`; access and refresh tokens must live in a vault or encrypted server-side store, never in Clerk metadata, public JSON, logs, or n8n credentials shared across tenants. The one deliberate, documented exception is n8n's Google Calendar credential: it authenticates as a single shared "calendar bot" account across every client rather than one OAuth connection per tenant, because per-tenant OAuth self-service was built and then explicitly dropped (see the handoff). Do not replicate that exception for any other integration without the same explicit product decision.

## API responsibilities

- `POST /api/retell/token`: create a Retell web-call token after origin and rate-limit checks.
- `POST /api/demo/lead`: validate and deliver a public lead.
- `/api/workspace`: authenticated prospect/client workspace state; also serves `?resource=voices|activity|calendar|notifications` reads and accepts `PATCH action=update_agent_configuration|save_calendar|update_voice|mark_notification_read|mark_all_notifications_read`.
- `/api/internal/clinics`: internal manual-payment and provisioning operations.
- `POST /api/retell/webhook`: verifies and persists Retell call lifecycle events (call_started/call_ended/call_analyzed) into the CRM schema.
- `POST /api/appointments/sync`: verifies an n8n-signed callback and records an agent-booked appointment (create/cancel/edit) into `app.appointments`.

Unknown `/api/*` paths must return JSON `404`, never the SPA fallback.

## Product and code rules

- Write user-facing copy in natural Mexican Spanish.
- Treat Retell prompts and scenario variables as server-controlled policy.
- Keep the landing and dashboard responsive and accessible.
- Use React functional components and hooks.
- Preserve UTF-8 accents.
- Keep changes scoped and avoid introducing parallel implementations.
- Run tests and both production builds after cross-application changes.

## Further reading

`docs/runbooks/` has the Spanish-language operating procedures referenced from the README: end-to-end setup (`PRIMER_FLUJO_FUNCIONAL.md`), the CRM/integrations database foundation (`DIA_2_CRM_E_INTEGRACIONES.md`), the manual client onboarding + n8n checklist (`ALTA_MANUAL_DE_CLIENTE_Y_N8N.md`), and linked-project/migration operations (`VERCEL_Y_SUPABASE.md`).
