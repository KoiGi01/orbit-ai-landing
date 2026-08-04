# AutiveX AI

AutiveX is a Spanish-first voice receptionist platform for businesses in Mexico. This repository contains the public landing page, the authenticated customer dashboard, the internal provisioning console, and the API layer that connects Clerk, Retell AI, lead delivery, and manual billing operations.

## Current product flow

1. A visitor explores the landing page and can run a real Retell AI voice demo.
2. A prospect can register through Clerk and complete a lightweight onboarding profile.
3. An AutiveX operator confirms an offline payment and provisions the client manually.
4. The activated client sees their workspace, onboarding state, and enabled voice demo.

Voice calls are powered exclusively by Retell AI. The browser requests a short-lived web-call access token from the backend; the Retell API key never reaches the client.

## Applications

- Landing: `src/landing.jsx`, served by the root Vite app.
- Dashboard: `dashboard/src/main.jsx`, served with `dashboard/vite.config.js`.
- Local API and production static server: `server/index.js`.
- Serverless API handlers: `api/`.
- Shared server logic: `lib/server/`.
- Versioned Postgres schema: `db/migrations/`.

## Local development

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env` and configure the server-only credentials. Copy `dashboard/.env.example` to `dashboard/.env` for Clerk's browser publishable key.

Run the landing and API:

```bash
npm run dev
```

Run the dashboard and API:

```bash
npm run dev:control
```

By default the landing is available at `http://127.0.0.1:5173`, the dashboard at `http://127.0.0.1:4184`, and the API at `http://127.0.0.1:8787`.

Prepare the server-only CRM database after configuring either `DATABASE_URL` or the local Supabase fallback (`SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_DB_POOLER_HOST`):

```bash
npm run db:migrate
npm run db:seed:mvp
```

Clerk remains the identity and organization system. Postgres stores operational CRM data and integration state; the browser never connects to Postgres directly.

## Verification

```bash
npm test
npm run build
npm run build:dashboard
```

## Integrations

- Retell AI: browser voice calls through `POST /api/retell/token`.
- Clerk: authentication, invitations, roles, and workspace access.
- n8n or Resend: lead delivery through `POST /api/demo/lead`.
- Manual billing: internal operators confirm payment and activate clinics in the admin console.

See `docs/runbooks/PRIMER_FLUJO_FUNCIONAL.md` for the end-to-end setup and operating procedure.
See `docs/runbooks/DIA_2_CRM_E_INTEGRACIONES.md` for the database foundation and self-service integration architecture.
