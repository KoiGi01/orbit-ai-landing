import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { getWorkspaceTrends, provisionWorkspaceFoundation } from '../lib/server/crm-foundation.js';

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

const ORGANIZATION_ID = 'org_trends_location';

async function seededWorkspace() {
  const client = new PGlite();
  for (const sql of MIGRATIONS) await client.exec(sql);
  const database = pgliteAdapter(client);
  const workspace = await provisionWorkspaceFoundation(database, {
    clerkOrganizationId: ORGANIZATION_ID,
    displayName: 'Clínica Tendencias',
  });
  return { database, workspaceId: workspace.id };
}

let callSeq = 0;
async function insertCall(database, workspaceId, { minutesAgo = 30, durationSeconds = 120, followUp = false } = {}) {
  callSeq += 1;
  await database.query(
    `
      insert into app.calls (workspace_id, external_call_id, channel, status, started_at, ended_at, duration_seconds, follow_up_required)
      values ($1, $2, 'phone', 'analyzed', now() - make_interval(mins => $3), now() - make_interval(mins => $3) + make_interval(secs => $4), $4, $5)
    `,
    [workspaceId, `call_trend_${callSeq}`, minutesAgo, durationSeconds, followUp],
  );
}

test('returns one bucket per day with the silent days included', async () => {
  const { database } = await seededWorkspace();
  const trends = await getWorkspaceTrends(database, ORGANIZATION_ID, 7);

  assert.equal(trends.granularity, 'day');
  assert.equal(trends.points.length, 7);
  assert.ok(trends.points.every((point) => point.calls === 0));
  assert.equal(trends.totals.calls, 0);
});

test('draws from the very first call', async () => {
  const { database, workspaceId } = await seededWorkspace();
  await insertCall(database, workspaceId, { minutesAgo: 20, durationSeconds: 180 });

  const trends = await getWorkspaceTrends(database, ORGANIZATION_ID, 7);
  assert.equal(trends.totals.calls, 1);
  assert.equal(trends.points.at(-1).calls, 1, 'the call lands in the newest bucket');
  assert.equal(trends.totals.avgDurationSeconds, 180);
  assert.ok(trends.points.some((point) => point.calls > 0));
});

test('splits the day into hours when the period is a single day', async () => {
  const { database, workspaceId } = await seededWorkspace();
  await insertCall(database, workspaceId, { minutesAgo: 10 });

  const trends = await getWorkspaceTrends(database, ORGANIZATION_ID, 1);
  assert.equal(trends.granularity, 'hour');
  assert.equal(trends.points.length, 24);
  assert.equal(trends.totals.calls, 1);
});

test('counts the calls that still need attention', async () => {
  const { database, workspaceId } = await seededWorkspace();
  await insertCall(database, workspaceId, { minutesAgo: 30, followUp: true });
  await insertCall(database, workspaceId, { minutesAgo: 40, followUp: false });
  await insertCall(database, workspaceId, { minutesAgo: 50, followUp: true });

  const trends = await getWorkspaceTrends(database, ORGANIZATION_ID, 7);
  assert.equal(trends.totals.calls, 3);
  assert.equal(trends.totals.needsAttention, 2);
});

test('leaves out calls older than the window', async () => {
  const { database, workspaceId } = await seededWorkspace();
  await insertCall(database, workspaceId, { minutesAgo: 60 });
  await insertCall(database, workspaceId, { minutesAgo: 60 * 24 * 20 });

  const week = await getWorkspaceTrends(database, ORGANIZATION_ID, 7);
  assert.equal(week.totals.calls, 1);

  const month = await getWorkspaceTrends(database, ORGANIZATION_ID, 30);
  assert.equal(month.totals.calls, 2);
  assert.equal(month.points.length, 30);
});

test('never counts another workspace activity', async () => {
  const { database, workspaceId } = await seededWorkspace();
  const other = await provisionWorkspaceFoundation(database, {
    clerkOrganizationId: 'org_trends_other_location',
    displayName: 'Otra Location',
  });
  await insertCall(database, workspaceId, { minutesAgo: 15 });
  await insertCall(database, other.id ? other.id : other, { minutesAgo: 15 });

  const trends = await getWorkspaceTrends(database, ORGANIZATION_ID, 7);
  assert.equal(trends.totals.calls, 1);
});

test('answers with an empty series when the workspace was never provisioned', async () => {
  const client = new PGlite();
  for (const sql of MIGRATIONS) await client.exec(sql);
  const trends = await getWorkspaceTrends(pgliteAdapter(client), 'org_trends_missing', 7);
  assert.deepEqual(trends.points, []);
  assert.equal(trends.totals.calls, 0);
});
