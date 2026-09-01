import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { getWorkspaceActivity, listWorkspaceNotifications, provisionWorkspaceFoundation } from '../lib/server/crm-foundation.js';
import { clearDemoData, getDemoDataStatus, populateDemoData } from '../lib/server/demo-data.js';

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

const ORGANIZATION_ID = 'org_demo_data_location';

async function seededWorkspace() {
  const client = new PGlite();
  for (const sql of MIGRATIONS) await client.exec(sql);
  const database = pgliteAdapter(client);
  const workspace = await provisionWorkspaceFoundation(database, {
    clerkOrganizationId: ORGANIZATION_ID,
    displayName: 'Clínica QA',
  });
  return { client, database, workspaceId: workspace.id };
}

// Inserts activity the way the Retell webhook would: no batch, so it is real.
async function insertRealCall(database, workspaceId, externalCallId = 'call_real_1') {
  const result = await database.query(
    `
      insert into app.calls (workspace_id, external_call_id, channel, status, started_at, ended_at, duration_seconds, summary)
      values ($1, $2, 'phone', 'analyzed', now() - interval '2 hours', now() - interval '2 hours' + interval '3 minutes', 180, 'Llamada real de producción.')
      returning id
    `,
    [workspaceId, externalCallId],
  );
  return result.rows[0].id;
}

test('populate seeds activity the client dashboard can read', async () => {
  const { database } = await seededWorkspace();
  const result = await populateDemoData(database, {
    clerkOrganizationId: ORGANIZATION_ID,
    profile: { clinicName: 'Clínica QA', services: ['Ortodoncia', 'Limpieza dental'] },
  });

  assert.match(result.batchId, /^[0-9a-f-]{36}$/);
  assert.ok(result.counts.calls > 20, 'seeds more calls than the activity window returns');
  assert.ok(result.counts.tasks > 0);
  assert.ok(result.counts.appointments > 0);
  assert.ok(result.counts.notifications > 0);
  assert.ok(result.counts.contacts > 0);

  const activity = await getWorkspaceActivity(database, ORGANIZATION_ID);
  assert.equal(activity.calls.length, 20);
  assert.ok(activity.tasks.length > 0);
  assert.ok(activity.calls.every((call) => call.contactName), 'every demo call is attributed to a contact');
  assert.ok(activity.calls.some((call) => call.followUpRequired), 'some calls need attention so the KPI is not zero');
  assert.ok(activity.tasks.some((task) => task.priority === 'urgent'));

  const { notifications, unreadCount } = await listWorkspaceNotifications(database, ORGANIZATION_ID);
  assert.equal(notifications.length, result.counts.notifications);
  assert.equal(unreadCount, result.counts.notifications);
});

test('seeded calls land inside the periods the dashboard filters by', async () => {
  const { database } = await seededWorkspace();
  await populateDemoData(database, { clerkOrganizationId: ORGANIZATION_ID });

  const activity = await getWorkspaceActivity(database, ORGANIZATION_ID);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const today = activity.calls.filter((call) => new Date(call.startedAt).getTime() >= dayAgo);
  assert.ok(today.length >= 5, `expected a believable "Hoy" column, got ${today.length}`);
  assert.ok(activity.calls.every((call) => new Date(call.startedAt).getTime() <= Date.now()), 'no demo call is in the future');
});

test('every seeded row carries the batch and no real row does', async () => {
  const { database } = await seededWorkspace();
  await insertRealCall(database, (await getDemoDataStatus(database, { clerkOrganizationId: ORGANIZATION_ID })).workspaceId);
  const { batchId } = await populateDemoData(database, { clerkOrganizationId: ORGANIZATION_ID });

  for (const table of ['contacts', 'calls', 'tasks', 'appointments', 'notifications']) {
    const orphans = await database.query(
      `select count(*)::int as total from app.${table} where demo_batch_id is not null and demo_batch_id <> $1`,
      [batchId],
    );
    assert.equal(orphans.rows[0].total, 0, `${table} has rows from another batch`);
  }

  const real = await database.query("select demo_batch_id from app.calls where external_call_id = 'call_real_1'");
  assert.equal(real.rows[0].demo_batch_id, null);
});

test('clear removes the demo batch and leaves real activity alone', async () => {
  const { database } = await seededWorkspace();
  const status = await getDemoDataStatus(database, { clerkOrganizationId: ORGANIZATION_ID });
  await insertRealCall(database, status.workspaceId);
  await populateDemoData(database, { clerkOrganizationId: ORGANIZATION_ID });

  const cleared = await clearDemoData(database, { clerkOrganizationId: ORGANIZATION_ID });
  assert.ok(cleared.counts.calls > 0);

  const activity = await getWorkspaceActivity(database, ORGANIZATION_ID);
  assert.equal(activity.calls.length, 1);
  assert.equal(activity.calls[0].summary, 'Llamada real de producción.');
  assert.equal(activity.tasks.length, 0);

  for (const table of ['contacts', 'calls', 'tasks', 'appointments', 'notifications']) {
    const left = await database.query(`select count(*)::int as total from app.${table} where demo_batch_id is not null`);
    assert.equal(left.rows[0].total, 0, `${table} still holds demo rows`);
  }
});

test('populating twice replaces the batch instead of stacking it', async () => {
  const { database } = await seededWorkspace();
  const first = await populateDemoData(database, { clerkOrganizationId: ORGANIZATION_ID });
  const second = await populateDemoData(database, { clerkOrganizationId: ORGANIZATION_ID });

  assert.notEqual(first.batchId, second.batchId);
  const calls = await database.query('select count(*)::int as total from app.calls where demo_batch_id is not null');
  assert.equal(calls.rows[0].total, second.counts.calls);
});

test('status separates demo activity from real activity', async () => {
  const { database } = await seededWorkspace();
  const empty = await getDemoDataStatus(database, { clerkOrganizationId: ORGANIZATION_ID });
  assert.equal(empty.demoCalls, 0);
  assert.equal(empty.realCalls, 0);

  await insertRealCall(database, empty.workspaceId);
  await populateDemoData(database, { clerkOrganizationId: ORGANIZATION_ID });

  const seeded = await getDemoDataStatus(database, { clerkOrganizationId: ORGANIZATION_ID });
  assert.equal(seeded.realCalls, 1);
  assert.ok(seeded.demoCalls > 0);
});

test('reads the name out of a stored service object', async () => {
  const { database } = await seededWorkspace();
  await populateDemoData(database, {
    clerkOrganizationId: ORGANIZATION_ID,
    profile: {
      clinicName: 'Clínica QA',
      services: [
        { name: 'Endodoncia', duration: '60 min', price: '$3,500', details: '', color: 'cobalto' },
        { name: 'Profilaxis', duration: '30 min', price: '$800', details: '', color: '' },
      ],
    },
  });

  const rows = await database.query(`
    select summary as text from app.calls where demo_batch_id is not null
    union all select description from app.tasks where demo_batch_id is not null
    union all select summary from app.appointments where demo_batch_id is not null
  `);
  const text = rows.rows.map((row) => row.text).join(' ');
  assert.ok(!text.includes('[object Object]'), 'a service object must never be stringified into the copy');
  assert.ok(text.includes('Endodoncia') || text.includes('Profilaxis'));
});

test('demo content follows the Location business profile', async () => {
  const { database } = await seededWorkspace();
  await populateDemoData(database, {
    clerkOrganizationId: ORGANIZATION_ID,
    profile: { clinicName: 'Estudio Lomas', services: ['Corte de cabello', 'Coloración'] },
  });

  const summaries = await database.query('select summary from app.calls where demo_batch_id is not null');
  const text = summaries.rows.map((row) => row.summary).join(' ');
  assert.ok(text.includes('Corte de cabello') || text.includes('Coloración'), 'summaries mention the Location services');
  assert.ok(!text.includes('Limpieza dental'), 'the generic fallback catalog is not used when the profile has services');
});

test('populate refuses a workspace that was never provisioned', async () => {
  const client = new PGlite();
  for (const sql of MIGRATIONS) await client.exec(sql);
  const database = pgliteAdapter(client);

  await assert.rejects(
    () => populateDemoData(database, { clerkOrganizationId: 'org_missing_workspace' }),
    /workspace_not_provisioned/,
  );
});
