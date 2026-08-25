import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { provisionMvpFoundation } from '../lib/server/crm-foundation.js';
import { handleRetellWebhookRequest, readRawBody, verifyRetellWebhookSignature } from '../lib/server/retell-webhook.js';

const MIGRATIONS_DIR = resolve('supabase/migrations');
const MIGRATION_FILES = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
const MIGRATIONS = await Promise.all(
  MIGRATION_FILES.map((name) => readFile(resolve(MIGRATIONS_DIR, name), 'utf8')),
);

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
  for (const sql of MIGRATIONS) await client.exec(sql);
  return { client, database: pgliteAdapter(client) };
}

function signedRequest(payload, apiKey) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const digest = createHmac('sha256', apiKey).update(`${rawBody}${timestamp}`).digest('hex');
  return { rawBody, signatureHeader: `v=${timestamp},d=${digest}` };
}

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
