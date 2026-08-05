# Repository guidance

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
npm test
npm run build
npm run build:dashboard
npm start                # API and built landing
```

## Environment

Use `.env.example` as the source of truth for server configuration and `dashboard/.env.example` for browser-safe Clerk configuration. Important server groups are:

- `RETELL_*` for voice agents and pinned versions
- `CLERK_*` and `AUTIVEX_ADMIN_*` for authentication and internal access
- `LEAD_WEBHOOK_*` or `RESEND_*` for lead delivery
- `AUTIVEX_PUBLIC_ORIGINS` and rate limits for public endpoint protection
- `DATABASE_URL` or Vercel's Supabase-provided `POSTGRES_URL` for the server-only CRM database; never create a `VITE_` database variable

## Persistent data

The canonical schema lives in `supabase/migrations/`. Run `npm run db:migrate` to apply pending migrations and `npm run db:seed:mvp` to bind the first Clerk organization to its Retell agent.

The repository is linked locally to the hosted Supabase and Vercel projects. Link metadata under `supabase/.temp/` and `.vercel/` is intentionally ignored. Create every schema change as a new Supabase migration, inspect it with `supabase db push --linked --dry-run`, and only then push it. Do not make untracked structural changes in the production SQL Editor.

Clerk owns identity, memberships, and organization roles. Postgres owns CRM activity, voice-agent bindings, webhook idempotency, and integration connection state. Every operational query must resolve and filter by the active Clerk organization; never trust a workspace ID supplied by browser input.

The `app` Postgres schema is private and has no browser role grants. OAuth credentials are represented only by `credential_ref`; access and refresh tokens must live in a vault or encrypted server-side store, never in Clerk metadata, public JSON, logs, or n8n credentials shared across tenants.

## API responsibilities

- `POST /api/retell/token`: create a Retell web-call token after origin and rate-limit checks.
- `POST /api/demo/lead`: validate and deliver a public lead.
- `/api/workspace`: authenticated prospect/client workspace state.
- `/api/internal/clinics`: internal manual-payment and provisioning operations.

Unknown `/api/*` paths must return JSON `404`, never the SPA fallback.

## Product and code rules

- Write user-facing copy in natural Mexican Spanish.
- Treat Retell prompts and scenario variables as server-controlled policy.
- Keep the landing and dashboard responsive and accessible.
- Use React functional components and hooks.
- Preserve UTF-8 accents.
- Keep changes scoped and avoid introducing parallel implementations.
- Run tests and both production builds after cross-application changes.
