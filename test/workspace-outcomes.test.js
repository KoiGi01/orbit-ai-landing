import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { getWorkspaceOutcomes, provisionWorkspaceFoundation } from '../lib/server/crm-foundation.js';

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

const ORGANIZATION_ID = 'org_outcomes_location';

async function seededWorkspace() {
  const client = new PGlite();
  for (const sql of MIGRATIONS) await client.exec(sql);
  const database = pgliteAdapter(client);
  const workspace = await provisionWorkspaceFoundation(database, {
    clerkOrganizationId: ORGANIZATION_ID,
    displayName: 'Clínica Resultados',
  });
  return { database, workspaceId: workspace.id };
}

let sequence = 0;
async function insertCall(database, workspaceId, { minutesAgo = 30, durationSeconds = 120, followUp = false, disposition = 'completed' } = {}) {
  sequence += 1;
  const result = await database.query(
    `
      insert into app.calls (
        workspace_id, external_call_id, channel, status, started_at, ended_at,
        duration_seconds, follow_up_required, disposition
      ) values (
        $1, $2, 'phone', 'analyzed',
        now() - make_interval(mins => $3),
        now() - make_interval(mins => $3) + make_interval(secs => $4),
        $4, $5, $6
      )
      returning id
    `,
    [workspaceId, `call_outcome_${sequence}`, minutesAgo, durationSeconds, followUp, disposition],
  );
  return result.rows[0].id;
}

async function bookAppointment(database, workspaceId, callId, status = 'confirmed') {
  sequence += 1;
  await database.query(
    `
      insert into app.appointments (workspace_id, external_event_id, calendar_id, call_id, summary, starts_at, ends_at, status)
      values ($1, $2, 'agenda@group.calendar.google.com', $3, 'Cita', now() + interval '1 day', now() + interval '1 day' + interval '45 minutes', $4)
    `,
    [workspaceId, `event_outcome_${sequence}`, callId, status],
  );
}

test('a call with a confirmed appointment counts as booked, not resolved', async () => {
  const { database, workspaceId } = await seededWorkspace();
  const callId = await insertCall(database, workspaceId);
  await bookAppointment(database, workspaceId, callId);

  const { outcomes, totals } = await getWorkspaceOutcomes(database, ORGANIZATION_ID, 7);
  assert.equal(outcomes.booked, 1);
  assert.equal(outcomes.resolved, 0);
  assert.equal(totals.calls, 1);
});

test('a cancelled appointment does not make the call a booking', async () => {
  const { database, workspaceId } = await seededWorkspace();
  const callId = await insertCall(database, workspaceId);
  await bookAppointment(database, workspaceId, callId, 'cancelled');

  const { outcomes } = await getWorkspaceOutcomes(database, ORGANIZATION_ID, 7);
  assert.equal(outcomes.booked, 0);
  assert.equal(outcomes.resolved, 1);
});

test('a voicemail counts as missed even though it also asks for a follow up', async () => {
  const { database, workspaceId } = await seededWorkspace();
  await insertCall(database, workspaceId, { disposition: 'voicemail', followUp: true });

  const { outcomes } = await getWorkspaceOutcomes(database, ORGANIZATION_ID, 7);
  assert.equal(outcomes.missed, 1);
  assert.equal(outcomes.needsFollowUp, 0);
});

test('an unsuccessful call lands in needs follow up', async () => {
  const { database, workspaceId } = await seededWorkspace();
  await insertCall(database, workspaceId, { disposition: 'unsuccessful', followUp: true });

  const { outcomes } = await getWorkspaceOutcomes(database, ORGANIZATION_ID, 7);
  assert.equal(outcomes.needsFollowUp, 1);
  assert.equal(outcomes.missed, 0);
});

test('the four categories always add up to the call total', async () => {
  const { database, workspaceId } = await seededWorkspace();
  const booked = await insertCall(database, workspaceId, { minutesAgo: 10 });
  await bookAppointment(database, workspaceId, booked);
  await insertCall(database, workspaceId, { minutesAgo: 20, disposition: 'voicemail', followUp: true });
  await insertCall(database, workspaceId, { minutesAgo: 30, disposition: 'unsuccessful', followUp: true });
  await insertCall(database, workspaceId, { minutesAgo: 40 });
  await insertCall(database, workspaceId, { minutesAgo: 50 });

  const { outcomes, totals } = await getWorkspaceOutcomes(database, ORGANIZATION_ID, 7);
  const sum = outcomes.booked + outcomes.missed + outcomes.needsFollowUp + outcomes.resolved;
  assert.equal(sum, totals.calls);
  assert.equal(totals.calls, 5);
  assert.deepEqual(outcomes, { booked: 1, missed: 1, needsFollowUp: 1, resolved: 2 });
});

test('needs attention is exactly the two categories the donut paints as pending', async () => {
  const { database, workspaceId } = await seededWorkspace();
  await insertCall(database, workspaceId, { disposition: 'voicemail', followUp: true });
  await insertCall(database, workspaceId, { disposition: 'unsuccessful', followUp: true });
  await insertCall(database, workspaceId, {});

  const { outcomes, totals } = await getWorkspaceOutcomes(database, ORGANIZATION_ID, 7);
  assert.equal(totals.needsAttention, outcomes.missed + outcomes.needsFollowUp);
  assert.equal(totals.needsAttention, 2);
});

test('averages the duration of the calls that lasted', async () => {
  const { database, workspaceId } = await seededWorkspace();
  await insertCall(database, workspaceId, { durationSeconds: 100 });
  await insertCall(database, workspaceId, { durationSeconds: 200 });

  const { totals } = await getWorkspaceOutcomes(database, ORGANIZATION_ID, 7);
  assert.equal(totals.avgDurationSeconds, 150);
});

test('leaves out calls older than the window', async () => {
  const { database, workspaceId } = await seededWorkspace();
  await insertCall(database, workspaceId, { minutesAgo: 60 });
  await insertCall(database, workspaceId, { minutesAgo: 60 * 24 * 20 });

  assert.equal((await getWorkspaceOutcomes(database, ORGANIZATION_ID, 7)).totals.calls, 1);
  assert.equal((await getWorkspaceOutcomes(database, ORGANIZATION_ID, 30)).totals.calls, 2);
});

test('never counts another workspace activity', async () => {
  const { database, workspaceId } = await seededWorkspace();
  const other = await provisionWorkspaceFoundation(database, {
    clerkOrganizationId: 'org_outcomes_other_location',
    displayName: 'Otra Location',
  });
  await insertCall(database, workspaceId, {});
  await insertCall(database, other.id, {});

  assert.equal((await getWorkspaceOutcomes(database, ORGANIZATION_ID, 7)).totals.calls, 1);
});

test('answers with zeros when the workspace was never provisioned', async () => {
  const client = new PGlite();
  for (const sql of MIGRATIONS) await client.exec(sql);
  const result = await getWorkspaceOutcomes(pgliteAdapter(client), 'org_outcomes_missing', 7);
  assert.deepEqual(result.outcomes, { booked: 0, missed: 0, needsFollowUp: 0, resolved: 0 });
  assert.equal(result.totals.calls, 0);
});
