import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  fetchCalendarEvents,
  handleAppointmentsWebhookRequest,
  listAgentBookedAppointments,
  upsertAgentAppointment,
  verifyAppointmentsWebhookSignature,
} from '../lib/server/appointments.js';
import { provisionMvpFoundation, upsertCallStarted } from '../lib/server/crm-foundation.js';

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

function signedBody(payload, secret) {
  const rawBody = JSON.stringify(payload);
  const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return { rawBody, signatureHeader: signature };
}

test('upserts an agent-booked appointment and links it to the call when found', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_appointments_1',
      displayName: 'Appointments One',
      externalAgentId: 'agent_appointments_1',
    });
    await upsertCallStarted(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_appointments_1',
      channel: 'phone',
      direction: 'inbound',
      fromPhone: '+525511110001',
    });

    const first = await upsertAgentAppointment(database, {
      workspaceId: foundation.workspace.id,
      externalEventId: 'evt_1',
      calendarId: 'clinic@group.calendar.google.com',
      retellCallId: 'call_appointments_1',
      summary: 'Limpieza dental',
      startsAt: '2026-09-01T15:00:00.000Z',
      endsAt: '2026-09-01T15:30:00.000Z',
    });
    assert.equal(first.status, 'confirmed');

    const row = await client.query('select call_id, status from app.appointments where id = $1', [first.id]);
    assert.ok(row.rows[0].call_id);
    assert.equal(row.rows[0].status, 'confirmed');

    // Redelivery (e.g. edit action) updates the same row instead of duplicating.
    const second = await upsertAgentAppointment(database, {
      workspaceId: foundation.workspace.id,
      externalEventId: 'evt_1',
      calendarId: 'clinic@group.calendar.google.com',
      summary: 'Limpieza dental (reagendada)',
      startsAt: '2026-09-02T16:00:00.000Z',
      status: 'cancelled',
    });
    assert.equal(second.id, first.id);
    assert.equal(second.status, 'cancelled');

    const count = await client.query('select count(*)::int as count from app.appointments where workspace_id = $1', [foundation.workspace.id]);
    assert.equal(count.rows[0].count, 1);
  } finally {
    await client.close();
  }
});

test('rejects an appointment for a workspace that does not exist', async () => {
  const { client, database } = await migratedDatabase();
  try {
    await assert.rejects(
      upsertAgentAppointment(database, {
        workspaceId: '00000000-0000-0000-0000-000000000000',
        externalEventId: 'evt_missing',
        calendarId: 'clinic@group.calendar.google.com',
        startsAt: '2026-09-01T15:00:00.000Z',
      }),
      /workspace_not_provisioned/,
    );
  } finally {
    await client.close();
  }
});

test('lists agent-booked appointments within a date range, tenant-scoped', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_appointments_2',
      displayName: 'Appointments Two',
      externalAgentId: 'agent_appointments_2',
    });
    const other = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_appointments_other',
      displayName: 'Other Tenant',
      externalAgentId: 'agent_appointments_other',
    });

    await upsertAgentAppointment(database, {
      workspaceId: foundation.workspace.id,
      externalEventId: 'evt_in_range',
      calendarId: 'clinic@group.calendar.google.com',
      startsAt: '2026-09-05T10:00:00.000Z',
    });
    await upsertAgentAppointment(database, {
      workspaceId: foundation.workspace.id,
      externalEventId: 'evt_out_of_range',
      calendarId: 'clinic@group.calendar.google.com',
      startsAt: '2026-12-01T10:00:00.000Z',
    });
    await upsertAgentAppointment(database, {
      workspaceId: other.workspace.id,
      externalEventId: 'evt_other_tenant',
      calendarId: 'other@group.calendar.google.com',
      startsAt: '2026-09-05T11:00:00.000Z',
    });

    const results = await listAgentBookedAppointments(database, foundation.workspace.id, {
      fromISO: '2026-09-01T00:00:00.000Z',
      toISO: '2026-09-30T23:59:59.000Z',
    });
    assert.deepEqual(results.map((item) => item.externalEventId), ['evt_in_range']);
  } finally {
    await client.close();
  }
});

test('verifies the appointments webhook signature over the raw body', () => {
  const rawBody = '{"workspaceId":"w1"}';
  const digest = createHmac('sha256', 'shared-secret').update(rawBody).digest('hex');
  assert.equal(verifyAppointmentsWebhookSignature(rawBody, `sha256=${digest}`, 'shared-secret'), true);
  assert.equal(verifyAppointmentsWebhookSignature(rawBody, `sha256=${digest}`, 'wrong-secret'), false);
  assert.equal(verifyAppointmentsWebhookSignature(rawBody, undefined, 'shared-secret'), false);
});

test('handleAppointmentsWebhookRequest rejects an invalid signature without touching the database', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const result = await handleAppointmentsWebhookRequest({
      rawBody: '{"workspaceId":"w1"}',
      signatureHeader: 'sha256=' + '0'.repeat(64),
      database,
      dependencies: { env: { AUTIVEX_APPOINTMENTS_WEBHOOK_SECRET: 'shared-secret' } },
    });
    assert.equal(result.status, 401);
    const count = await client.query('select count(*)::int as count from app.appointments');
    assert.equal(count.rows[0].count, 0);
  } finally {
    await client.close();
  }
});

test('handleAppointmentsWebhookRequest records a valid, correctly-signed appointment', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_appointments_webhook',
      displayName: 'Appointments Webhook',
      externalAgentId: 'agent_appointments_webhook',
    });
    const { rawBody, signatureHeader } = signedBody({
      workspaceId: foundation.workspace.id,
      externalEventId: 'evt_webhook_1',
      calendarId: 'clinic@group.calendar.google.com',
      summary: 'Consulta',
      startsAt: '2026-09-10T12:00:00.000Z',
    }, 'shared-secret');

    const result = await handleAppointmentsWebhookRequest({
      rawBody,
      signatureHeader,
      database,
      dependencies: { env: { AUTIVEX_APPOINTMENTS_WEBHOOK_SECRET: 'shared-secret' } },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);

    const row = await client.query('select external_event_id from app.appointments where workspace_id = $1', [foundation.workspace.id]);
    assert.equal(row.rows[0].external_event_id, 'evt_webhook_1');
  } finally {
    await client.close();
  }
});

test('fetchCalendarEvents calls the shared n8n webhook and normalizes its response', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      appointments: [
        { id: 'evt_a', summary: 'Limpieza', start: { dateTime: '2026-09-01T15:00:00.000Z' }, end: { dateTime: '2026-09-01T15:30:00.000Z' } },
        { id: '', summary: 'Sin id, se descarta', start: { dateTime: '2026-09-02T10:00:00.000Z' } },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const events = await fetchCalendarEvents({
    calendarId: 'clinic@group.calendar.google.com',
    fromISO: '2026-09-01T00:00:00.000Z',
    toISO: '2026-09-30T00:00:00.000Z',
  }, { env: { RETELL_CALENDAR_WEBHOOK_URL: 'https://n8n.example.test/webhook/retell-calendar' }, fetchImpl });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.args.action, 'list');
  assert.equal(requests[0].body.args.calendarId, 'clinic@group.calendar.google.com');
  assert.deepEqual(events, [
    { externalEventId: 'evt_a', summary: 'Limpieza', startsAt: '2026-09-01T15:00:00.000Z', endsAt: '2026-09-01T15:30:00.000Z' },
  ]);
});
