# Retell Webhook Receiver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Retell's `call_started`/`call_ended`/`call_analyzed` webhook events into `app.calls`/`app.contacts`/`app.tasks`, idempotently and tenant-scoped, via a new signed `POST /api/retell/webhook` endpoint.

**Architecture:** A new `lib/server/retell-webhook.js` module owns Retell-specific concerns (raw-body reading, HMAC signature verification, event parsing, orchestration). New functions in `lib/server/crm-foundation.js` own the actual SQL persistence (workspace resolution, webhook-event idempotency, call/contact/task upserts), following that file's existing transaction-based upsert style. Two thin entry points — `api/retell/webhook.js` (Vercel) and a new branch in `server/index.js` (local dev) — read the raw request and delegate to the orchestrator, exactly like every other route in this repo.

**Tech Stack:** Node's built-in `crypto` (HMAC-SHA256, `timingSafeEqual`), `postgres` via the existing `lib/server/database.js` wrapper, `@electric-sql/pglite` for DB-backed tests, Node's built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-08-22-retell-webhook-receiver-design.md`

## Global Constraints

- Retell AI is the only voice provider in this repository — do not add another voice transport, client SDK, or token endpoint.
- Never expose `RETELL_API_KEY`, database credentials, or any secret via `VITE_` variables, logs, or JSON responses.
- `api/retell/webhook.js` and the `server/index.js` equivalent must have matching observable behavior for the same inputs.
- Every workspace resolution must go through `resolveWebhookWorkspace`, which trusts only the value Retell echoes back in `retell_llm_dynamic_variables` (itself set server-side at provisioning time) — never trust a workspace id from an untrusted source.
- Unknown `/api/*` paths must keep returning JSON `404` — do not touch that fallback.
- Preserve UTF-8 accents in any Spanish user-facing text (e.g. task titles).
- Run `npm test` after every task. Run `npm test && npm run build && npm run build:dashboard` before Task 6 is considered done, per this repo's cross-application verification rule.

---

## File Structure

- **Create** `lib/server/retell-webhook.js` — raw body reading, HMAC signature verification, event parsing/dispatch orchestration. Nothing in here talks to Postgres directly.
- **Modify** `lib/server/crm-foundation.js` — add `resolveWebhookWorkspace`, `recordWebhookEvent`, `markWebhookEventStatus`, `upsertCallStarted`, `upsertCallEnded`, `upsertCallAnalyzed`. This file already owns every other piece of direct SQL persistence against `app.*` tables (workspaces, voice agents, integrations) using the same transaction-based upsert style, so the new call/contact/task functions belong here rather than in a new file — deliberately not splitting it further, per this repo's "follow existing patterns, don't unilaterally restructure" rule.
- **Modify** `test/database-foundation.test.js` — add DB-backed tests for the new `crm-foundation.js` functions, reusing the file's existing `migratedDatabase()` PGlite helper.
- **Create** `test/retell-webhook.test.js` — unit tests for signature verification/raw-body reading, plus DB-backed orchestration tests (duplicating the small `migratedDatabase()` helper, matching this repo's existing per-file test-setup convention — there is no shared test-utils module today).
- **Create** `api/retell/webhook.js` — Vercel function entry point.
- **Modify** `server/index.js` — add a `handleRetellWebhook` function and its dispatch branch.

---

### Task 1: Signature verification and raw body reading

**Files:**
- Create: `lib/server/retell-webhook.js`
- Test: `test/retell-webhook.test.js`

**Interfaces:**
- Produces: `readRawBody(readable: AsyncIterable<Buffer|string>): Promise<string>`, `verifyRetellWebhookSignature(rawBody: string, signatureHeader: string|undefined, apiKey: string|undefined, options?: { now?: number }): boolean`

- [ ] **Step 1: Write the failing tests**

Create `test/retell-webhook.test.js`:

```js
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';
import { readRawBody, verifyRetellWebhookSignature } from '../lib/server/retell-webhook.js';

test('reads the full raw body from a readable stream', async () => {
  const readable = Readable.from([Buffer.from('{"a":1}')]);
  const body = await readRawBody(readable);
  assert.equal(body, '{"a":1}');
});

test('accepts a signature computed over the raw body and timestamp', () => {
  const rawBody = '{"event":"call_started"}';
  const timestamp = String(Date.now());
  const digest = createHmac('sha256', 'test-key').update(`${rawBody}${timestamp}`).digest('hex');
  const header = `v=${timestamp},d=${digest}`;
  assert.equal(verifyRetellWebhookSignature(rawBody, header, 'test-key'), true);
});

test('rejects a signature computed with the wrong key', () => {
  const rawBody = '{"event":"call_started"}';
  const timestamp = String(Date.now());
  const digest = createHmac('sha256', 'wrong-key').update(`${rawBody}${timestamp}`).digest('hex');
  const header = `v=${timestamp},d=${digest}`;
  assert.equal(verifyRetellWebhookSignature(rawBody, header, 'test-key'), false);
});

test('rejects a signature older than 5 minutes', () => {
  const rawBody = '{"event":"call_started"}';
  const timestamp = String(Date.now() - 6 * 60 * 1000);
  const digest = createHmac('sha256', 'test-key').update(`${rawBody}${timestamp}`).digest('hex');
  const header = `v=${timestamp},d=${digest}`;
  assert.equal(verifyRetellWebhookSignature(rawBody, header, 'test-key'), false);
});

test('rejects a missing signature header', () => {
  assert.equal(verifyRetellWebhookSignature('{}', undefined, 'test-key'), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/server/retell-webhook.js'`

- [ ] **Step 3: Write the implementation**

Create `lib/server/retell-webhook.js`:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_RE = /^v=(\d+),d=([0-9a-f]{64})$/i;
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

export async function readRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function verifyRetellWebhookSignature(rawBody, signatureHeader, apiKey, { now = Date.now() } = {}) {
  if (!apiKey) return false;
  const match = SIGNATURE_RE.exec(String(signatureHeader || '').trim());
  if (!match) return false;

  const [, timestampText, digestHex] = match;
  const timestamp = Number(timestampText);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > MAX_SIGNATURE_AGE_MS) return false;

  const expectedHex = createHmac('sha256', apiKey).update(`${rawBody}${timestampText}`).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(digestHex, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all 5 new tests)

- [ ] **Step 5: Commit**

```bash
git add lib/server/retell-webhook.js test/retell-webhook.test.js
git commit -m "Add Retell webhook signature verification and raw body reading"
```

---

### Task 2: Workspace resolution and webhook idempotency

**Files:**
- Modify: `lib/server/crm-foundation.js`
- Test: `test/database-foundation.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `resolveWebhookWorkspace(database, workspaceId: string|undefined): Promise<string|null>`, `recordWebhookEvent(database, { workspaceId, eventKey, eventType, externalObjectId, payloadSha256, safePayload }): Promise<string|null>` (returns the new `webhook_events.id`, or `null` if `event_key` already exists), `markWebhookEventStatus(database, id: string, status: string, errorCode?: string|null): Promise<void>`

- [ ] **Step 1: Write the failing tests**

In `test/database-foundation.test.js`, extend the existing import from `../lib/server/crm-foundation.js`:

```js
import {
  getWorkspaceFoundation,
  listIntegrationCatalog,
  markWebhookEventStatus,
  provisionMvpFoundation,
  provisionVoiceAgentDraft,
  provisionVoiceAgentFoundation,
  provisionWorkspaceFoundation,
  recordWebhookEvent,
  resolveWebhookWorkspace,
} from '../lib/server/crm-foundation.js';
```

Then append these tests at the end of the file:

```js
test('resolves a webhook workspace only for a real, active workspace id', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_webhook_resolve',
      displayName: 'Webhook Resolve',
      externalAgentId: 'agent_webhook_resolve_123',
    });

    assert.equal(await resolveWebhookWorkspace(database, foundation.workspace.id), foundation.workspace.id);
    assert.equal(await resolveWebhookWorkspace(database, '00000000-0000-0000-0000-000000000000'), null);
    assert.equal(await resolveWebhookWorkspace(database, 'not-a-uuid'), null);
    assert.equal(await resolveWebhookWorkspace(database, undefined), null);
  } finally {
    await client.close();
  }
});

test('records a webhook event once and marks its terminal status', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_webhook_record',
      displayName: 'Webhook Record',
      externalAgentId: 'agent_webhook_record_123',
    });

    const id = await recordWebhookEvent(database, {
      workspaceId: foundation.workspace.id,
      eventKey: 'call_started:call_1',
      eventType: 'call_started',
      externalObjectId: 'call_1',
      payloadSha256: 'a'.repeat(64),
      safePayload: { event: 'call_started' },
    });
    assert.ok(id);

    const duplicate = await recordWebhookEvent(database, {
      workspaceId: foundation.workspace.id,
      eventKey: 'call_started:call_1',
      eventType: 'call_started',
      externalObjectId: 'call_1',
      payloadSha256: 'a'.repeat(64),
      safePayload: { event: 'call_started' },
    });
    assert.equal(duplicate, null);

    await markWebhookEventStatus(database, id, 'processed');
    const processedRow = await client.query('select status, processed_at from app.webhook_events where id = $1', [id]);
    assert.equal(processedRow.rows[0].status, 'processed');
    assert.ok(processedRow.rows[0].processed_at);

    await markWebhookEventStatus(database, id, 'failed', 'boom');
    const failedRow = await client.query('select status, last_error_code from app.webhook_events where id = $1', [id]);
    assert.equal(failedRow.rows[0].status, 'failed');
    assert.equal(failedRow.rows[0].last_error_code, 'boom');
  } finally {
    await client.close();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `resolveWebhookWorkspace is not a function` (or similar for the other two)

- [ ] **Step 3: Write the implementation**

In `lib/server/crm-foundation.js`, add near the other exported functions (after `provisionMvpFoundation`, before `getWorkspaceFoundation` is fine):

```js
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveWebhookWorkspace(database, rawWorkspaceId) {
  const workspaceId = String(rawWorkspaceId || '').trim();
  if (!UUID_RE.test(workspaceId)) return null;
  const result = await database.query(
    `
      select id
      from app.workspaces
      where id = $1::uuid and archived_at is null
      limit 1
    `,
    [workspaceId],
  );
  return result.rows[0]?.id || null;
}

export async function recordWebhookEvent(database, raw = {}) {
  const result = await database.query(
    `
      insert into app.webhook_events (
        workspace_id,
        provider,
        event_key,
        event_type,
        external_object_id,
        signature_verified_at,
        payload_sha256,
        safe_payload
      ) values ($1, 'retell', $2, $3, $4, now(), $5, $6::text::jsonb)
      on conflict (provider, event_key) do nothing
      returning id
    `,
    [
      raw.workspaceId,
      raw.eventKey,
      raw.eventType,
      raw.externalObjectId || null,
      raw.payloadSha256 || null,
      JSON.stringify(raw.safePayload || {}),
    ],
  );
  return result.rows[0]?.id || null;
}

export async function markWebhookEventStatus(database, id, status, errorCode = null) {
  await database.query(
    `
      update app.webhook_events
      set status = $2,
          last_error_code = $3,
          processed_at = case when $2 in ('processed', 'ignored') then now() else processed_at end
      where id = $1
    `,
    [id, status, errorCode],
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/server/crm-foundation.js test/database-foundation.test.js
git commit -m "Add webhook workspace resolution and idempotency recording"
```

---

### Task 3: `call_started` / `call_ended` persistence

**Files:**
- Modify: `lib/server/crm-foundation.js`
- Test: `test/database-foundation.test.js`

**Interfaces:**
- Consumes: nothing from Tasks 1–2 directly (called independently by the orchestrator in Task 5).
- Produces: `upsertCallStarted(database, { workspaceId, externalCallId, channel: 'phone'|'web', direction: 'inbound'|'outbound', fromPhone?, toPhone?, startedAt? }): Promise<string>` (returns `calls.id`), `upsertCallEnded(database, { workspaceId, externalCallId, endedAt?, durationSeconds? }): Promise<string>` (returns `calls.id`)

- [ ] **Step 1: Write the failing tests**

Add to the import block in `test/database-foundation.test.js`:

```js
  upsertCallEnded,
  upsertCallStarted,
```

Append these tests:

```js
test('creates an ongoing phone call with a linked contact, then closes it on call_ended', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_call_lifecycle',
      displayName: 'Call Lifecycle',
      externalAgentId: 'agent_call_lifecycle_123',
    });

    const callId = await upsertCallStarted(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_lifecycle_1',
      channel: 'phone',
      direction: 'inbound',
      fromPhone: '+525511112222',
      toPhone: '+525599998888',
      startedAt: '2026-08-22T10:00:00.000Z',
    });

    const started = await client.query('select status, channel, contact_id from app.calls where id = $1', [callId]);
    assert.equal(started.rows[0].status, 'ongoing');
    assert.equal(started.rows[0].channel, 'phone');
    assert.ok(started.rows[0].contact_id);

    const contact = await client.query('select phone_e164 from app.contacts where id = $1', [started.rows[0].contact_id]);
    assert.equal(contact.rows[0].phone_e164, '+525511112222');

    const repeated = await upsertCallStarted(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_lifecycle_1',
      channel: 'phone',
      direction: 'inbound',
      fromPhone: '+525511112222',
    });
    assert.equal(repeated, callId);

    const closedId = await upsertCallEnded(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_lifecycle_1',
      endedAt: '2026-08-22T10:03:00.000Z',
      durationSeconds: 180,
    });
    assert.equal(closedId, callId);

    const ended = await client.query('select status, duration_seconds from app.calls where id = $1', [callId]);
    assert.equal(ended.rows[0].status, 'ended');
    assert.equal(ended.rows[0].duration_seconds, 180);
  } finally {
    await client.close();
  }
});

test('does not create a contact for a web call', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_web_call',
      displayName: 'Web Call',
      externalAgentId: 'agent_web_call_123',
    });

    const callId = await upsertCallStarted(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_web_1',
      channel: 'web',
      direction: 'inbound',
    });

    const row = await client.query('select contact_id, channel from app.calls where id = $1', [callId]);
    assert.equal(row.rows[0].contact_id, null);
    assert.equal(row.rows[0].channel, 'web');
  } finally {
    await client.close();
  }
});

test('call_ended creates a row when call_started was never delivered', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_out_of_order',
      displayName: 'Out Of Order',
      externalAgentId: 'agent_out_of_order_123',
    });

    const callId = await upsertCallEnded(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_out_of_order_1',
      endedAt: '2026-08-22T10:03:00.000Z',
      durationSeconds: 42,
    });

    const row = await client.query('select status, duration_seconds from app.calls where id = $1', [callId]);
    assert.equal(row.rows[0].status, 'ended');
    assert.equal(row.rows[0].duration_seconds, 42);
  } finally {
    await client.close();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `upsertCallStarted is not a function`

- [ ] **Step 3: Write the implementation**

In `lib/server/crm-foundation.js`, add a small helper near the top (next to `jsonObject`):

```js
function phoneOrNull(value) {
  const text = cleanText(value, 40);
  return /^[+][1-9][0-9]{7,14}$/.test(text) ? text : null;
}
```

Then add, after `markWebhookEventStatus`:

```js
export async function upsertCallStarted(database, raw = {}) {
  const workspaceId = raw.workspaceId;
  const externalCallId = requiredText(raw.externalCallId, 128, 'missing_external_call_id');
  const channel = raw.channel === 'phone' ? 'phone' : 'web';
  const direction = raw.direction === 'outbound' ? 'outbound' : 'inbound';
  const fromPhone = phoneOrNull(raw.fromPhone);
  const toPhone = phoneOrNull(raw.toPhone);
  const startedAt = raw.startedAt || null;

  return database.transaction(async (transaction) => {
    const existing = await transaction.query(
      `select id from app.calls where workspace_id = $1 and provider = 'retell' and external_call_id = $2 limit 1`,
      [workspaceId, externalCallId],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    let contactId = null;
    if (channel === 'phone') {
      const customerPhone = direction === 'outbound' ? toPhone : fromPhone;
      if (customerPhone) {
        const contact = await transaction.query(
          `
            insert into app.contacts (workspace_id, phone_e164, source)
            values ($1, $2, 'voice_call')
            on conflict (workspace_id, phone_e164) where phone_e164 is not null and archived_at is null
            do update set last_contacted_at = now(), updated_at = now()
            returning id
          `,
          [workspaceId, customerPhone],
        );
        contactId = contact.rows[0]?.id || null;
      }
    }

    const call = await transaction.query(
      `
        insert into app.calls (
          workspace_id, contact_id, provider, external_call_id,
          channel, direction, status, from_phone_e164, to_phone_e164, started_at
        ) values ($1, $2, 'retell', $3, $4, $5, 'ongoing', $6, $7, $8)
        returning id
      `,
      [workspaceId, contactId, externalCallId, channel, direction, fromPhone, toPhone, startedAt],
    );
    return call.rows[0].id;
  });
}

export async function upsertCallEnded(database, raw = {}) {
  const workspaceId = raw.workspaceId;
  const externalCallId = requiredText(raw.externalCallId, 128, 'missing_external_call_id');
  const endedAt = raw.endedAt || null;
  const durationSeconds = Number.isFinite(raw.durationSeconds) ? Math.max(0, Math.round(raw.durationSeconds)) : null;

  return database.transaction(async (transaction) => {
    const existing = await transaction.query(
      `select id from app.calls where workspace_id = $1 and provider = 'retell' and external_call_id = $2 limit 1`,
      [workspaceId, externalCallId],
    );

    if (!existing.rows[0]) {
      const inserted = await transaction.query(
        `
          insert into app.calls (workspace_id, provider, external_call_id, status, ended_at, duration_seconds)
          values ($1, 'retell', $2, 'ended', $3, $4)
          returning id
        `,
        [workspaceId, externalCallId, endedAt, durationSeconds],
      );
      return inserted.rows[0].id;
    }

    const updated = await transaction.query(
      `
        update app.calls
        set status = 'ended', ended_at = $2, duration_seconds = $3, updated_at = now()
        where id = $1
        returning id
      `,
      [existing.rows[0].id, endedAt, durationSeconds],
    );
    return updated.rows[0].id;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/server/crm-foundation.js test/database-foundation.test.js
git commit -m "Persist call_started and call_ended into app.calls/app.contacts"
```

---

### Task 4: `call_analyzed` persistence and follow-up task creation

**Files:**
- Modify: `lib/server/crm-foundation.js`
- Test: `test/database-foundation.test.js`

**Interfaces:**
- Consumes: nothing directly (independently callable; the orchestrator in Task 5 calls it after `upsertCallStarted`).
- Produces: `upsertCallAnalyzed(database, { workspaceId, externalCallId, summary?, inVoicemail: boolean, callSuccessful: boolean|undefined, analysis: object }): Promise<{ callId: string }>`

- [ ] **Step 1: Write the failing tests**

Add `upsertCallAnalyzed` to the import block in `test/database-foundation.test.js`. Append:

```js
test('analyzes a call, derives normal urgency, and creates exactly one review task', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_call_analyzed',
      displayName: 'Call Analyzed',
      externalAgentId: 'agent_call_analyzed_123',
    });
    const callId = await upsertCallStarted(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_analyzed_1',
      channel: 'phone',
      direction: 'inbound',
      fromPhone: '+525511112222',
    });

    await upsertCallAnalyzed(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_analyzed_1',
      summary: 'El cliente pidió una cita para el viernes.',
      inVoicemail: false,
      callSuccessful: true,
      analysis: { user_sentiment: 'Positive' },
    });

    const call = await client.query('select status, urgency, follow_up_required from app.calls where id = $1', [callId]);
    assert.equal(call.rows[0].status, 'analyzed');
    assert.equal(call.rows[0].urgency, 'normal');
    assert.equal(call.rows[0].follow_up_required, false);

    const tasks = await client.query('select kind, priority, contact_id, call_id from app.tasks where call_id = $1', [callId]);
    assert.equal(tasks.rows.length, 1);
    assert.equal(tasks.rows[0].kind, 'review_call');
    assert.equal(tasks.rows[0].priority, 'normal');
    assert.ok(tasks.rows[0].contact_id);

    await upsertCallAnalyzed(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_analyzed_1',
      summary: 'El cliente pidió una cita para el viernes.',
      inVoicemail: false,
      callSuccessful: true,
      analysis: { user_sentiment: 'Positive' },
    });
    const tasksAfterRetry = await client.query('select id from app.tasks where call_id = $1', [callId]);
    assert.equal(tasksAfterRetry.rows.length, 1);
  } finally {
    await client.close();
  }
});

test('escalates urgency and task priority for a voicemail', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_voicemail',
      displayName: 'Voicemail',
      externalAgentId: 'agent_voicemail_123',
    });
    const callId = await upsertCallStarted(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_voicemail_1',
      channel: 'phone',
      direction: 'inbound',
      fromPhone: '+525511113333',
    });

    await upsertCallAnalyzed(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_voicemail_1',
      summary: 'Buzón de voz.',
      inVoicemail: true,
      callSuccessful: false,
      analysis: { in_voicemail: true },
    });

    const call = await client.query('select urgency, follow_up_required from app.calls where id = $1', [callId]);
    assert.equal(call.rows[0].urgency, 'urgent');
    assert.equal(call.rows[0].follow_up_required, true);

    const task = await client.query('select kind, priority from app.tasks where call_id = $1', [callId]);
    assert.equal(task.rows[0].kind, 'urgent_callback');
    assert.equal(task.rows[0].priority, 'urgent');
  } finally {
    await client.close();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `upsertCallAnalyzed is not a function`

- [ ] **Step 3: Write the implementation**

In `lib/server/crm-foundation.js`, add after `upsertCallEnded`:

```js
export async function upsertCallAnalyzed(database, raw = {}) {
  const workspaceId = raw.workspaceId;
  const externalCallId = requiredText(raw.externalCallId, 128, 'missing_external_call_id');
  const summary = cleanText(raw.summary, 2000) || null;
  const inVoicemail = raw.inVoicemail === true;
  const callSuccessful = raw.callSuccessful;
  const analysis = jsonObject(raw.analysis);
  const urgency = inVoicemail ? 'urgent' : callSuccessful === false ? 'high' : 'normal';
  const followUpRequired = inVoicemail || callSuccessful === false;

  return database.transaction(async (transaction) => {
    const existing = await transaction.query(
      `select id, contact_id from app.calls where workspace_id = $1 and provider = 'retell' and external_call_id = $2 limit 1`,
      [workspaceId, externalCallId],
    );

    let callId;
    let contactId = null;
    if (existing.rows[0]) {
      callId = existing.rows[0].id;
      contactId = existing.rows[0].contact_id;
      await transaction.query(
        `
          update app.calls
          set status = 'analyzed', summary = $2, urgency = $3, follow_up_required = $4,
              analysis = $5::text::jsonb, updated_at = now()
          where id = $1
        `,
        [callId, summary, urgency, followUpRequired, JSON.stringify(analysis)],
      );
    } else {
      const inserted = await transaction.query(
        `
          insert into app.calls (
            workspace_id, provider, external_call_id, status,
            summary, urgency, follow_up_required, analysis
          ) values ($1, 'retell', $2, 'analyzed', $3, $4, $5, $6::text::jsonb)
          returning id
        `,
        [workspaceId, externalCallId, summary, urgency, followUpRequired, JSON.stringify(analysis)],
      );
      callId = inserted.rows[0].id;
    }

    const kind = inVoicemail ? 'urgent_callback' : 'review_call';
    const priority = inVoicemail ? 'urgent' : callSuccessful === false ? 'high' : 'normal';
    const title = cleanText(`Revisar llamada${summary ? `: ${summary}` : ''}`, 180);

    await transaction.query(
      `
        insert into app.tasks (
          workspace_id, contact_id, call_id, kind, title, description, priority, dedupe_key
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (workspace_id, dedupe_key) where dedupe_key is not null
        do nothing
      `,
      [workspaceId, contactId, callId, kind, title, summary, priority, `call:${externalCallId}:review`],
    );

    return { callId };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/server/crm-foundation.js test/database-foundation.test.js
git commit -m "Persist call_analyzed and create one follow-up task per call"
```

---

### Task 5: Orchestrator — `handleRetellWebhookRequest`

**Files:**
- Modify: `lib/server/retell-webhook.js`
- Modify: `test/retell-webhook.test.js`

**Interfaces:**
- Consumes: `verifyRetellWebhookSignature`, `readRawBody` (Task 1); `resolveWebhookWorkspace`, `recordWebhookEvent`, `markWebhookEventStatus` (Task 2); `upsertCallStarted`, `upsertCallEnded` (Task 3); `upsertCallAnalyzed` (Task 4) — all from `../lib/server/crm-foundation.js`.
- Produces: `handleRetellWebhookRequest({ rawBody: string, signatureHeader: string|undefined, database, dependencies?: { env?: object } }): Promise<{ status: number, body: object|null }>`

- [ ] **Step 1: Write the failing tests**

At the top of `test/retell-webhook.test.js`, add these imports (alongside the existing ones):

```js
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { provisionMvpFoundation } from '../lib/server/crm-foundation.js';
import { handleRetellWebhookRequest } from '../lib/server/retell-webhook.js';
```

(Merge this with the existing `readRawBody, verifyRetellWebhookSignature` import from `../lib/server/retell-webhook.js` into one import statement.)

Then add this setup, right after the imports:

```js
const MIGRATION_PATH = resolve('supabase/migrations/20260804000000_crm_and_integrations.sql');
const MIGRATION = await readFile(MIGRATION_PATH, 'utf8');

function pgliteAdapter(client) {
  const adapter = {
    query: (text, parameters = []) => client.query(text, parameters),
    execute: (text) => client.exec(text),
    async transaction(callback) {
      await client.exec('begin');
      try {
        const result = await callback(adapter);
        await client.exec('commit');
        return result;
      } catch (error) {
        await client.exec('rollback');
        throw error;
      }
    },
  };
  return adapter;
}

async function migratedDatabase() {
  const client = new PGlite();
  await client.exec(MIGRATION);
  return { client, database: pgliteAdapter(client) };
}

function signedRequest(payload, apiKey) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const digest = createHmac('sha256', apiKey).update(`${rawBody}${timestamp}`).digest('hex');
  return { rawBody, signatureHeader: `v=${timestamp},d=${digest}` };
}
```

Then append these tests:

```js
test('processes the full call lifecycle and is idempotent on redelivery', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_orchestrator',
      displayName: 'Orchestrator',
      externalAgentId: 'agent_orchestrator_123',
    });
    const dependencies = { env: { RETELL_API_KEY: 'test-key' } };
    const dynamicVars = { workspace_id: foundation.workspace.id };

    const started = signedRequest({
      event: 'call_started',
      call: {
        call_id: 'call_orch_1', call_type: 'phone_call', direction: 'inbound',
        from_number: '+525511114444', to_number: '+525599990000', start_timestamp: 1755000000000,
        retell_llm_dynamic_variables: dynamicVars,
      },
    }, 'test-key');
    const startedResult = await handleRetellWebhookRequest({ ...started, database, dependencies });
    assert.equal(startedResult.status, 204);

    const redelivered = await handleRetellWebhookRequest({ ...started, database, dependencies });
    assert.equal(redelivered.status, 204);
    const callsAfterRedelivery = await client.query(
      "select count(*)::int as count from app.calls where external_call_id = 'call_orch_1'",
    );
    assert.equal(callsAfterRedelivery.rows[0].count, 1);

    const analyzed = signedRequest({
      event: 'call_analyzed',
      call: {
        call_id: 'call_orch_1', call_type: 'phone_call',
        call_analysis: { call_summary: 'Cliente agendó cita.', in_voicemail: false, call_successful: true },
        retell_llm_dynamic_variables: dynamicVars,
      },
    }, 'test-key');
    const analyzedResult = await handleRetellWebhookRequest({ ...analyzed, database, dependencies });
    assert.equal(analyzedResult.status, 204);

    const call = await client.query("select status from app.calls where external_call_id = 'call_orch_1'");
    assert.equal(call.rows[0].status, 'analyzed');
    const tasks = await client.query('select count(*)::int as count from app.tasks');
    assert.equal(tasks.rows[0].count, 1);
  } finally {
    await client.close();
  }
});

test('rejects an invalid signature without touching the database', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const result = await handleRetellWebhookRequest({
      rawBody: '{"event":"call_started","call":{"call_id":"call_bad_sig"}}',
      signatureHeader: `v=1,d=${'0'.repeat(64)}`,
      database,
      dependencies: { env: { RETELL_API_KEY: 'test-key' } },
    });
    assert.equal(result.status, 401);
    const events = await client.query('select count(*)::int as count from app.webhook_events');
    assert.equal(events.rows[0].count, 0);
  } finally {
    await client.close();
  }
});

test('acknowledges but drops an event with no resolvable workspace', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const request = signedRequest({
      event: 'call_started',
      call: { call_id: 'call_no_workspace', call_type: 'web_call', retell_llm_dynamic_variables: {} },
    }, 'test-key');
    const result = await handleRetellWebhookRequest({
      ...request, database, dependencies: { env: { RETELL_API_KEY: 'test-key' } },
    });
    assert.equal(result.status, 204);
    const calls = await client.query('select count(*)::int as count from app.calls');
    assert.equal(calls.rows[0].count, 0);
  } finally {
    await client.close();
  }
});

test('marks the event failed and returns a retryable status when persistence throws', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_failure',
      displayName: 'Failure',
      externalAgentId: 'agent_failure_123',
    });
    const request = signedRequest({
      event: 'call_started',
      call: {
        call_id: 'call_failure_1', call_type: 'phone_call', direction: 'inbound',
        retell_llm_dynamic_variables: { workspace_id: foundation.workspace.id },
      },
    }, 'test-key');

    const failingDatabase = {
      ...database,
      transaction() { throw new Error('simulated_db_failure'); },
    };
    const result = await handleRetellWebhookRequest({
      ...request, database: failingDatabase, dependencies: { env: { RETELL_API_KEY: 'test-key' } },
    });
    assert.equal(result.status, 502);

    const event = await client.query(
      "select status, last_error_code from app.webhook_events where event_key = 'call_started:call_failure_1'",
    );
    assert.equal(event.rows[0].status, 'failed');
    assert.equal(event.rows[0].last_error_code, 'simulated_db_failure');
  } finally {
    await client.close();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `handleRetellWebhookRequest is not a function`

- [ ] **Step 3: Write the implementation**

In `lib/server/retell-webhook.js`, add the import at the top and the orchestrator at the bottom:

```js
import { createHash } from 'node:crypto';
import {
  markWebhookEventStatus,
  recordWebhookEvent,
  resolveWebhookWorkspace,
  upsertCallAnalyzed,
  upsertCallEnded,
  upsertCallStarted,
} from './crm-foundation.js';

const HANDLED_EVENTS = new Set(['call_started', 'call_ended', 'call_analyzed']);

export async function handleRetellWebhookRequest({ rawBody, signatureHeader, database, dependencies = {} }) {
  const env = dependencies.env || process.env;
  const apiKey = env.RETELL_API_KEY;
  if (!verifyRetellWebhookSignature(rawBody, signatureHeader, apiKey)) {
    return { status: 401, body: { error: 'invalid_signature' } };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'invalid_json_payload' } };
  }

  const event = String(payload.event || '');
  const call = payload.call || {};
  const externalCallId = String(call.call_id || '');
  if (!HANDLED_EVENTS.has(event) || !externalCallId) {
    return { status: 204, body: null };
  }

  const dynamicVariables = call.retell_llm_dynamic_variables || {};
  const workspaceId = await resolveWebhookWorkspace(database, dynamicVariables.workspace_id);
  if (!workspaceId) return { status: 204, body: null };

  const eventKey = `${event}:${externalCallId}`;
  const payloadSha256 = createHash('sha256').update(rawBody).digest('hex');
  const safePayload = {
    event,
    callId: externalCallId,
    callType: call.call_type || null,
    callStatus: call.call_status || null,
  };
  const eventId = await recordWebhookEvent(database, {
    workspaceId, eventKey, eventType: event, externalObjectId: externalCallId, payloadSha256, safePayload,
  });
  if (!eventId) return { status: 204, body: null };

  try {
    if (event === 'call_started') {
      await upsertCallStarted(database, {
        workspaceId,
        externalCallId,
        channel: call.call_type === 'phone_call' ? 'phone' : 'web',
        direction: call.direction === 'outbound' ? 'outbound' : 'inbound',
        fromPhone: call.from_number || null,
        toPhone: call.to_number || null,
        startedAt: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
      });
    } else if (event === 'call_ended') {
      await upsertCallEnded(database, {
        workspaceId,
        externalCallId,
        endedAt: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null,
        durationSeconds: call.start_timestamp && call.end_timestamp
          ? Math.max(0, Math.round((call.end_timestamp - call.start_timestamp) / 1000))
          : null,
      });
    } else {
      const analysis = call.call_analysis || {};
      await upsertCallAnalyzed(database, {
        workspaceId,
        externalCallId,
        summary: analysis.call_summary || null,
        inVoicemail: analysis.in_voicemail === true,
        callSuccessful: analysis.call_successful,
        analysis,
      });
    }
    await markWebhookEventStatus(database, eventId, 'processed');
    return { status: 204, body: null };
  } catch (error) {
    await markWebhookEventStatus(database, eventId, 'failed', String(error?.message || 'unknown').slice(0, 120));
    return { status: 502, body: { error: 'webhook_processing_failed' } };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/server/retell-webhook.js test/retell-webhook.test.js
git commit -m "Add Retell webhook orchestration with idempotent event dispatch"
```

---

### Task 6: Wire the two entry points

**Files:**
- Create: `api/retell/webhook.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `readRawBody`, `handleRetellWebhookRequest` from `lib/server/retell-webhook.js`; `createDatabase` from `lib/server/database.js`.
- Produces: `POST /api/retell/webhook` in both the Vercel deployment and the local dev server.

- [ ] **Step 1: Create the Vercel function**

Create `api/retell/webhook.js`:

```js
import { createDatabase } from '../../lib/server/database.js';
import { handleRetellWebhookRequest, readRawBody } from '../../lib/server/retell-webhook.js';

export const config = { api: { bodyParser: false } };

function sendResult(res, result) {
  res.status(result.status).setHeader('cache-control', 'no-store');
  if (result.body === null) {
    res.end();
    return;
  }
  res.json(result.body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).setHeader('cache-control', 'no-store').json({ error: 'method_not_allowed' });
    return;
  }

  const database = createDatabase();
  try {
    const rawBody = await readRawBody(req);
    const result = await handleRetellWebhookRequest({
      rawBody,
      signatureHeader: req.headers['x-retell-signature'],
      database,
      dependencies: {},
    });
    sendResult(res, result);
  } catch (error) {
    console.error('Retell webhook failed:', error?.message || error);
    res.status(502).setHeader('cache-control', 'no-store').json({ error: 'webhook_processing_failed' });
  } finally {
    await database.close();
  }
}
```

- [ ] **Step 2: Wire the local dev server**

In `server/index.js`, add to the existing import block (alongside `buildRetellDemoVariables, configuredAgentVersion`):

```js
import { handleRetellWebhookRequest, readRawBody } from '../lib/server/retell-webhook.js';
```

Add this function next to `handleRetellToken`:

```js
async function handleRetellWebhook(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  const database = createDatabase();
  try {
    const rawBody = await readRawBody(req);
    const result = await handleRetellWebhookRequest({
      rawBody,
      signatureHeader: req.headers['x-retell-signature'],
      database,
      dependencies: {},
    });
    if (result.body === null) {
      res.writeHead(result.status, { 'cache-control': 'no-store' });
      res.end();
      return;
    }
    sendJson(res, result.status, result.body);
  } catch (error) {
    console.error('Retell webhook failed:', error?.message || error);
    sendJson(res, 502, { error: 'webhook_processing_failed' });
  } finally {
    await database.close();
  }
}
```

Add the dispatch branch, right after the `/api/retell/token` branch:

```js
  if (pathname === '/api/retell/webhook') {
    await handleRetellWebhook(req, res);
    return;
  }
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS (no regressions — this task adds no new automated tests, matching this repo's existing convention of testing `lib/server/*` directly rather than the `api/`/`server/index.js` entry points)

- [ ] **Step 4: Manually verify against the local dev server**

This repo has no existing automated test for entry-point HTTP wiring (`api/*.js` handlers and `server/index.js` routes are exercised only through their underlying `lib/server` functions), so verify this one by hand. In one terminal, with `RETELL_API_KEY=local-test-key` set in `.env.local` (or exported in that shell), start the dev server and leave it running:

```bash
npm run dev:server
```

In a second terminal, once the server is up, run:

```bash
node -e "
const crypto = require('node:crypto');
const body = JSON.stringify({ event: 'call_started', call: { call_id: 'manual_check_1', call_type: 'web_call', retell_llm_dynamic_variables: {} } });
const ts = String(Date.now());
const digest = crypto.createHmac('sha256', 'local-test-key').update(body + ts).digest('hex');
console.log(JSON.stringify({ body, signature: 'v=' + ts + ',d=' + digest }));
" > webhook-check.json
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8787/api/retell/webhook \
  -H "content-type: application/json" \
  -H "x-retell-signature: $(node -e "console.log(require('./webhook-check.json').signature)")" \
  -d "$(node -e "console.log(require('./webhook-check.json').body)")"
rm webhook-check.json
```

Expected: `204` (no resolvable workspace for this test payload, which is the correct "acknowledge and drop" behavior). Stop the dev server (Ctrl+C in the first terminal) when done.

Any value works for `RETELL_API_KEY` here — this only exercises the app's own HMAC verification, not a real call to Retell's API, so no live Retell credentials are needed for this check.

- [ ] **Step 5: Run the full verification suite and commit**

```bash
npm test
npm run build
npm run build:dashboard
git add api/retell/webhook.js server/index.js
git commit -m "Wire POST /api/retell/webhook in the Vercel function and local dev server"
```

---

## Explicitly out of scope (tracked separately, per the spec)

- Setting `webhook_url` on each Retell agent at provisioning/draft-creation time so events actually get delivered here.
- Rewiring the dashboard UI to read `app.calls`/`app.contacts`/`app.tasks` instead of its current demo data.
- An internal retry/dead-letter worker for `app.webhook_events` — `next_retry_at`/`dead_letter` stay unused; Retell's own 3× redelivery is the only retry mechanism for this phase.
