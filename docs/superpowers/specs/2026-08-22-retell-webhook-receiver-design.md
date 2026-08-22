# Retell webhook receiver — design

**Date:** 2026-08-22
**Status:** approved for planning
**Author:** Claude Code (with KoiGi01)

## Problem

Retell AI sends `call_started`, `call_ended`, and `call_analyzed` webhook events
per call, but nothing in this repository receives them. `app.calls`,
`app.contacts`, `app.tasks`, and `app.webhook_events` were fully designed for
this in `supabase/migrations/20260804000000_crm_and_integrations.sql` but
nothing writes to them. As a result, the dashboard's calls/metrics/tasks
widgets remain permanently demo data (see
`docs/CLAUDE_CODE_HANDOFF_2026-08-05.md` §10).

## Scope

**In scope:** a new inbound webhook endpoint that verifies Retell's
signature, resolves the owning workspace, and idempotently persists call
lifecycle data and derived follow-up tasks into the existing schema.

**Explicitly out of scope** (separate follow-up work):
- Setting `webhook_url` on each Retell agent at provisioning time so events
  actually get delivered here.
- Rewiring the dashboard UI to read `app.calls`/`app.contacts`/`app.tasks`
  instead of its current demo data.
- An internal retry/dead-letter worker for `app.webhook_events` (see
  "Failure handling" below — deferred by design, not an oversight).

## Decisions

These were confirmed with the product owner before this design was written:

1. **Demo agent scope:** only events whose dynamic variables resolve to a
   real `app.workspaces` row are persisted. The public landing-page demo
   agent has no `workspace_id`, so its calls are acknowledged (`204`) and
   dropped without a DB write.
2. **Contact creation:** only phone-channel calls create/update
   `app.contacts`. Web calls (a client testing their own agent from the
   dashboard) are logged in `app.calls` but never create a contact, since
   the caller is the operator, not a customer.
3. **Task creation:** every `call_analyzed` event creates exactly one
   `app.tasks` row (not conditional on signal strength). Its `kind` and
   `priority` are still derived from the call analysis so the queue isn't
   uniform noise (see "Per-event handling" below).
4. **Failure handling:** no new cron/retry worker for this phase. On
   processing failure the handler returns a non-2xx status and relies on
   Retell's own redelivery (up to 3× within 10s). Failed rows sit at
   `app.webhook_events.status = 'failed'` for manual/future handling;
   `next_retry_at` and `dead_letter` stay unused.

## Architecture

### Entry points

A new route, `POST /api/retell/webhook`, added in both places this
repository's API surface exists (per `CLAUDE.md`'s "keep their observable
behavior aligned" rule):

- `api/retell/webhook.js` — Vercel function. Must set
  `export const config = { api: { bodyParser: false } };` to get the raw
  request stream, because Retell's signature is computed over the exact
  bytes sent, not a re-serialized JSON string.
- `server/index.js` — add a dispatch branch alongside the existing
  `/api/retell/token`, `/api/workspace`, etc. branches. The local server
  already reads the raw request as a buffer before `JSON.parse`
  (see the existing `readBody`-style helper) — the webhook route needs to
  keep that raw string for signature verification instead of only the
  parsed object.

### New module: `lib/server/retell-webhook.js`

Houses everything provider-specific and DB-agnostic-until-called, called
identically by both entry points:

- `verifyRetellWebhookSignature(rawBody, signatureHeader, apiKey)` — parses
  `v={timestamp},d={hexDigest}` from `X-Retell-Signature`, rejects
  timestamps more than 5 minutes old, computes
  `HMAC-SHA256(rawBody + timestamp, apiKey)` and compares to `hexDigest`
  with a constant-time comparison (mirrors the existing HMAC pattern in
  `notifyProvisioningStarted` in `lib/server/retell-provisioning.js`, but
  verifying inbound instead of signing outbound).
- `resolveWebhookWorkspace(database, call)` — reads
  `call.retell_llm_dynamic_variables.workspace_id` /
  `.clerk_organization_id`, looks up `app.workspaces`. Returns `null` if
  absent or unresolvable (demo agent, stale/orphaned draft).
- `recordWebhookEvent(transaction, { workspaceId, callId, provider: 'retell', event, rawBody })`
  — the idempotency gate: `insert into app.webhook_events (...) on conflict (provider, event_key) do nothing returning id`,
  with `event_key = '{event}:{call_id}'`. No returned row ⇒ duplicate ⇒
  caller short-circuits to `204`.
- `applyCallStarted`, `applyCallEnded`, `applyCallAnalyzed` — one function
  per event type, each wrapped in `database.transaction(...)` alongside the
  matching `webhook_events.status` update, following the existing
  transaction style in `lib/server/crm-foundation.js`.
- A shared `findOrCreateCallRow` upsert helper (matched by
  `(workspace_id, external_call_id)`) used by all three event handlers,
  since delivery order isn't guaranteed.

### Per-event handling

- **`call_started`** — insert into `app.calls` if the row doesn't exist:
  `status='ongoing'`, `channel` (`web`/`phone` from `call.call_type`),
  `direction`, `from_phone_e164`/`to_phone_e164`, `started_at`. If
  `channel === 'phone'` and a caller number is present, upsert
  `app.contacts` by `(workspace_id, phone_e164)` and link `contact_id`.
- **`call_ended`** — update the matched row: `ended_at`,
  `duration_seconds`, `status='ended'`. If no row exists yet (out-of-order
  delivery), create one first with whatever fields are available.
- **`call_analyzed`** — update `analysis` (raw `call_analysis` payload),
  `summary`, `disposition`, `follow_up_required`, `status='analyzed'`, and
  a derived `urgency` (`in_voicemail` or `call_successful === false` →
  `high`/`urgent`; otherwise `normal`). Always create one `app.tasks` row:
  `dedupe_key = 'call:{call_id}:review'` (idempotent against reprocessing),
  `kind = 'urgent_callback'` when voicemail/urgent, else `'review_call'`,
  `priority` mirrors the derived urgency, `title` built from
  contact/summary, `call_id`/`contact_id` linked.

### Idempotency

`app.webhook_events` already has `unique (provider, event_key)`. This is
the sole idempotency mechanism — no in-memory/application-level cache,
because Vercel functions don't share memory across invocations or
instances, so anything short of a DB constraint would be unsound in this
environment.

### Error handling

If any step in an event's transaction throws, the transaction rolls back;
the pre-inserted `webhook_events` row is updated to `status='failed'` with
`last_error_code` in a separate statement (outside the rolled-back
transaction, so the failure is actually recorded); the handler responds
with a non-2xx status so Retell's built-in redelivery retries.

### Testing

New `test/retell-webhook.test.js`, following the mock style already used in
`test/retell-provisioning.test.js`:

- Signature verification: valid, invalid, and expired-timestamp cases.
- Idempotent replay: the same `event_key` delivered twice results in only
  one set of side effects.
- Full three-event lifecycle against a seeded workspace, asserting the
  `app.calls` row's status transitions and the resulting `app.tasks` row.
- No-workspace path: dynamic variables missing/unresolvable → `204`, no
  writes.
- Contact-creation branching: phone calls create/update `app.contacts`;
  web calls do not.

## Open items for the implementation plan

- Exact field names inside `call.retell_llm_dynamic_variables` and
  `call.call_analysis` should be pinned down against a live Retell test
  call during implementation — the design above reflects public docs and
  the fields this repo already sends, but hasn't been verified against a
  live payload.
- Whether `RETELL_API_KEY` alone is sufficient for signature verification,
  or whether a distinct "webhook-enabled" key needs to be provisioned in
  the Retell dashboard (per Retell's docs: "only the API key that has a
  webhook badge next to it can be used to verify the webhook").
