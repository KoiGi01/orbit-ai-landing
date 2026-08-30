import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  getAdminActivitySummary,
  provisionWorkspaceFoundation,
  upsertCallEnded,
  upsertCallStarted,
} from '../lib/server/crm-foundation.js';

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

function daysAgo(days, hour = 12) {
  const date = new Date();
  date.setUTCHours(hour, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

async function recordCall(database, workspaceId, externalCallId, startedAt, durationSeconds) {
  await upsertCallStarted(database, {
    workspaceId, externalCallId, channel: 'phone', direction: 'inbound',
    fromPhone: '+525511112222', toPhone: '+525599998888', startedAt,
  });
  await upsertCallEnded(database, {
    workspaceId, externalCallId, startedAt, durationSeconds,
    endedAt: new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString(),
  });
}

test('summarizes calls per organization with a dense daily series', async () => {
  const { database } = await migratedDatabase();
  const busy = await provisionWorkspaceFoundation(database, {
    clerkOrganizationId: 'org_busy', displayName: 'Dental Norte', timezone: 'America/Mexico_City',
  });
  const quiet = await provisionWorkspaceFoundation(database, {
    clerkOrganizationId: 'org_quiet', displayName: 'Norte Estudio', timezone: 'America/Mexico_City',
  });

  await recordCall(database, busy.id, 'call_a', daysAgo(1), 120);
  await recordCall(database, busy.id, 'call_b', daysAgo(1), 240);
  await recordCall(database, busy.id, 'call_c', daysAgo(9), 60);
  await recordCall(database, quiet.id, 'call_d', daysAgo(2), 30);

  const { days, timeline, summary } = await getAdminActivitySummary(database, 14);

  assert.equal(days, 14);
  assert.equal(timeline.length, 14);
  // Every Location gets one point per day, including the silent ones, or the
  // sparkline would compress gaps and imply activity that never happened.
  assert.equal(summary.org_busy.series.length, 14);
  assert.equal(summary.org_busy.totalCalls, 3);
  // Only two of the three calls fall inside the trailing week.
  assert.equal(summary.org_busy.recentCalls, 2);
  assert.equal(summary.org_quiet.totalCalls, 1);

  // Weighted by call count rather than averaging the daily averages, which
  // would let one quiet day outweigh a busy one.
  assert.equal(summary.org_busy.averageDurationSeconds, 140);
});

test('leaves an organization out entirely when it has no calls in the window', async () => {
  const { database } = await migratedDatabase();
  const workspace = await provisionWorkspaceFoundation(database, {
    clerkOrganizationId: 'org_silent', displayName: 'Studio Oral', timezone: 'America/Mexico_City',
  });
  await recordCall(database, workspace.id, 'call_old', daysAgo(40), 90);

  const { summary } = await getAdminActivitySummary(database, 14);
  assert.deepEqual(summary, {});
});

test('clamps the window instead of trusting the caller', async () => {
  const { database } = await migratedDatabase();
  for (const [input, expected] of [[0, 1], [-5, 1], [500, 90], ['7', 7], [null, 14]]) {
    const { days } = await getAdminActivitySummary(database, input);
    assert.equal(days, expected, `days=${input}`);
  }
});
