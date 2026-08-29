# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Start here:** read `docs/CLAUDE_CODE_HANDOFF_2026-08-26.md` before making changes. It is the current verified handoff for production state, architecture, pending integrations, and next checkpoints. Older planning documents (including earlier dated handoffs) may describe superseded assumptions.

## Product

AutiveX is a Spanish-first voice receptionist platform for businesses in Mexico. The public landing page demonstrates the product, while the Clerk-protected dashboard supports prospects, activated clients, and internal operators.

Billing is deliberately outside the current MVP activation path. An operator creates a Location and it goes through onboarding and provisioning with `billingStatus: not_required`. The manual-payment code (the `confirm_payment` action and the `unpaid`/`verified` states) is still live and still reachable, but it is legacy kept for later reuse — do not treat a new Location as blocked on payment.

The product calls a customer workspace a **Location**. Server code, the internal API path, and most `lib/server/clerk-control.js` exports still say **clinic** (`/api/internal/clinics`, `listClinics`, `bypassClinicLive`, `overrideClinicStage`). They are the same thing. Keep new user-facing copy on "Location" and do not rename the existing server surface as a drive-by change.

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

The dashboard bundle is one React Router app with three distinct surfaces, so find the right one before editing:

- `dashboard/src/main.jsx` mounts `<DashboardAuth DashboardComponent={App} />` at the bottom of the file. Everything above that line is `App`, the client-facing workspace shell (sidebar, KPIs, task queue, module pages).
- `dashboard/src/auth.jsx` owns the Clerk provider and every route: `/sign-in`, `/sign-up`, `/accept-invitation`, `/admin` (`/internal` redirects to it), and `/onboarding` + `/app`, which both render `AccountGate` and are redirected between each other based on workspace state.
- `dashboard/src/internal-admin.jsx` is the operator console; `dashboard/src/workspace.jsx` holds the prospect intake and preview screens.
- `dashboard/src/dev-preview.jsx` installs sample calendar and voice reads so those screens can be reviewed without a login. It is gated on both `import.meta.env.DEV` and an explicit `?preview=dashboard`, so a normal `npm run dev:control` sign-in still hits the real API. Do not widen that gate.

All dashboard network calls go through `dashboard/src/control-api.js`, which attaches the Clerk token. Add new reads and writes there rather than calling `fetch` from a component.

In production, `vercel.json` rewrites `/sign-in`, `/sign-up`, `/accept-invitation`, `/onboarding`, `/app`, `/admin`, and `/internal` (plus their subpaths) to `dashboard.html`; everything else falls through to the landing build. `npm run build:platform` is what produces that combined `dist/` output and is the command Vercel actually runs.

## Voice architecture

Both the landing and the eligible dashboard workspace use `retell-client-js-sdk`. They POST the selected scenario to `/api/retell/token`, receive a short-lived `access_token`, and start a browser call with `RetellWebClient`.

Server-controlled scenario variables and agent-version validation live in `lib/server/retell-demo.js`. As with every route, the implementation exists in both `api/retell/token.js` and the local server route in `server/index.js`; keep their observable behavior aligned.

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

## Request layering

Every endpoint is written once and dispatched twice. This is the single most important structural fact in the repository:

1. **`lib/server/*.js` holds all the logic.** `lib/server/clerk-control.js` is the business core — it authenticates the Clerk session, resolves the organization, enforces roles, mutates Clerk metadata, appends the audit trail, and calls into `retell-provisioning.js`, `appointments.js`, `crm-foundation.js`, and `database.js`. It throws `ControlError(status, code)`, which both transports render through the shared `errorResponse` helper.
2. **`api/**/*.js` are thin Vercel adapters.** They map method plus `action` to an exported function, open and close a database handle, and serialize. They should contain no business rules.
3. **`server/index.js` is a parallel Node `http` dispatcher** that imports the same `lib/server` exports and hand-rolls the same routing, then serves the built static apps.

So adding or changing an endpoint means touching the `lib/server` function, `api/<path>.js`, **and** the matching `if (pathname === ...)` branch in `server/index.js`. Missing the third is the classic bug here: it works in production and 404s locally, or vice versa.

## API responsibilities

- `POST /api/retell/token`: create a Retell web-call token after origin and rate-limit checks.
- `POST /api/demo/lead`: validate and deliver a public lead.
- `/api/workspace`: authenticated prospect/client workspace state; also serves `?resource=voices|activity|calendar|notifications` reads and accepts `PATCH action=update_agent_configuration|save_calendar|update_voice|mark_notification_read|mark_all_notifications_read`.
- `/api/internal/clinics`: the internal operator console's whole surface. `GET` lists Locations, `POST` creates one, `DELETE` removes one behind a typed confirmation, and `PATCH` carries `action=confirm_payment|save_provisioning|start_configuration|update_location|manage_member|bypass_live|override_stage|save_calendar|update_agent_configuration|update_agent_advanced`.
- `POST /api/retell/webhook`: verifies and persists Retell call lifecycle events (call_started/call_ended/call_analyzed) into the CRM schema.
- `POST /api/appointments/sync`: verifies an n8n-signed callback and records an agent-booked appointment (create/cancel/edit) into `app.appointments`.
- `GET /api/health/database`: reports server-to-database connectivity and migration readiness without returning credentials or connection details.

Unknown `/api/*` paths must return JSON `404`, never the SPA fallback.

## Account state machine

There is no `status` column driving the product. Account state lives in **Clerk organization metadata** and is derived on every request:

- `metadataState()` in `lib/server/clerk-control.js` reads four `publicMetadata` fields: `billingStatus`, `onboardingStatus`, `serviceStatus`, and `profileComplete`.
- `resolveWorkspaceView(state)` collapses those into the single `view` the dashboard renders: `suspended`, `billing_recovery`, `live`, `provisioning`, `onboarding`, `prospect_demo`, or `prospect_intake`. `getWorkspace()` adds two more before that: `internal_admin` for an operator and `organization_required` when the session has no `orgId`.
- `accountProvisioningEnabled(state)` is the gate that lets a Location past prospect screens; it is true for `billingStatus` of `verified` or `not_required`.
- `AccountGate` in `dashboard/src/auth.jsx` branches on that same `view` to redirect between `/onboarding` and `/app` and to send operators to `/admin`.

Named stage presets (`prospect`, `onboarding`, `configuring`, `review`, `live`, `suspended`) at the bottom of `clerk-control.js` are what `override_stage` writes. Change a lifecycle rule in `resolveWorkspaceView` and those presets together — a state that no view resolves to strands the customer on a blank screen.

Private, never-serialized data goes in Clerk `privateMetadata`: the business profile, the provisioning draft (`retellAgentId`), the connected `calendarId`, and a rolling 24-entry `auditTrail`. `serializeProfileForClient` strips `internalNotes` and `calendarId` before anything reaches the browser, so read those off the raw profile when server code needs them.

## Product and code rules

- Write user-facing copy in natural Mexican Spanish.
- Treat Retell prompts and scenario variables as server-controlled policy.
- Keep the landing and dashboard responsive and accessible.
- Use React functional components and hooks.
- Preserve UTF-8 accents.
- Keep changes scoped and avoid introducing parallel implementations.
- Run tests and both production builds after cross-application changes.

## Testing conventions

`test/` uses `node:test` with `node:assert/strict` and no test framework, runner config, or mocking library.

- Database-backed suites (`database-foundation`, `appointments`, `retell-webhook`) boot an in-memory Postgres with `@electric-sql/pglite`, apply every file in `supabase/migrations/` in order, and wrap the client in a small adapter that matches the `postgres` tagged-template interface used by `lib/server/database.js`. A new migration is therefore exercised by the existing suites automatically — if it does not apply cleanly, those tests fail.
- Outbound HTTP is never patched onto globals. `lib/server/retell-provisioning.js` functions take a trailing `dependencies` argument and resolve `dependencies.fetchImpl || fetch` plus an injected `env`, so tests pass a stub `fetchImpl` and a literal `{ RETELL_API_KEY: 'test-key' }`. Keep that signature when adding a function that calls out or reads configuration.
- Signature-verified endpoints are tested by computing the HMAC with `node:crypto` in the test itself, so a change to the signing scheme must be made in both places.

## Further reading

`docs/runbooks/` has the Spanish-language operating procedures referenced from the README: end-to-end setup (`PRIMER_FLUJO_FUNCIONAL.md`), the CRM/integrations database foundation (`DIA_2_CRM_E_INTEGRACIONES.md`), the manual client onboarding + n8n checklist (`ALTA_MANUAL_DE_CLIENTE_Y_N8N.md`), and linked-project/migration operations (`VERCEL_Y_SUPABASE.md`).
