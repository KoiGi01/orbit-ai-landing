import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { provisionMvpFoundation } from '../lib/server/crm-foundation.js';
import {
  beginGoogleCalendarOAuth,
  completeGoogleCalendarOAuth,
  decryptGoogleCredential,
  encryptGoogleCredential,
  executeGoogleCalendarTool,
  listWritableGoogleCalendars,
  selectGoogleCalendar,
} from '../lib/server/google-calendar.js';

const MIGRATIONS_DIR = resolve('supabase/migrations');
const MIGRATION_FILES = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
const MIGRATIONS = await Promise.all(MIGRATION_FILES.map((name) => readFile(resolve(MIGRATIONS_DIR, name), 'utf8')));

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
  for (const migration of MIGRATIONS) await client.exec(migration);
  return { client, database: pgliteAdapter(client) };
}

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const ENV = {
  AUTIVEX_APP_URL: 'https://autivex.example.test',
  GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  AUTIVEX_CREDENTIAL_ENCRYPTION_KEY: ENCRYPTION_KEY,
};
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

function writableCalendars() {
  return {
    items: [
      { id: 'owner@example.com', summary: 'Principal', primary: true, accessRole: 'owner', timeZone: 'America/Mexico_City' },
      { id: 'team@group.calendar.google.com', summary: 'Reservaciones', accessRole: 'writer', timeZone: 'America/Mexico_City' },
    ],
  };
}

test('encrypts Google refresh tokens with workspace-bound authenticated encryption', () => {
  const firstWorkspace = '11111111-1111-4111-8111-111111111111';
  const secondWorkspace = '22222222-2222-4222-8222-222222222222';
  const encrypted = encryptGoogleCredential({ refreshToken: 'refresh-secret' }, firstWorkspace, ENV);
  assert.equal(encrypted.includes('refresh-secret'), false);
  assert.equal(decryptGoogleCredential(encrypted, firstWorkspace, ENV).refreshToken, 'refresh-secret');
  assert.throws(() => decryptGoogleCredential(encrypted, secondWorkspace, ENV), /google_credential_invalid/);
});

test('completes one-time OAuth, lists writable calendars and persists only ciphertext', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_google_oauth',
      displayName: 'Google OAuth',
      externalAgentId: 'agent_google_oauth',
    });
    const start = await beginGoogleCalendarOAuth(database, {
      workspaceId: foundation.workspace.id,
      clerkUserId: 'user_google_admin',
    }, { env: ENV });
    const authorizationUrl = new URL(start.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state');
    assert.equal(authorizationUrl.searchParams.get('access_type'), 'offline');
    assert.equal(authorizationUrl.searchParams.get('prompt'), 'consent');
    assert.ok(authorizationUrl.searchParams.get('scope').includes('calendar.events'));

    const fetchImpl = async (url, options = {}) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        const body = new URLSearchParams(options.body);
        if (body.get('grant_type') === 'authorization_code') {
          return Response.json({ access_token: 'access-initial', refresh_token: 'refresh-top-secret', scope: SCOPES });
        }
        return Response.json({ access_token: 'access-refreshed', expires_in: 3600 });
      }
      if (String(url).includes('/users/me/calendarList')) return Response.json(writableCalendars());
      throw new Error(`unexpected_url:${url}`);
    };

    const completed = await completeGoogleCalendarOAuth(database, {
      state,
      cookieState: state,
      code: 'authorization-code',
    }, { env: ENV, fetchImpl });
    assert.equal(completed.clerkOrganizationId, 'org_google_oauth');
    assert.equal(completed.calendarCount, 2);

    const credential = await client.query('select encrypted_payload from app.integration_credentials where workspace_id = $1', [foundation.workspace.id]);
    assert.equal(credential.rows.length, 1);
    assert.equal(credential.rows[0].encrypted_payload.includes('refresh-top-secret'), false);
    const connection = await client.query('select status, external_account_id, credential_ref from app.integration_connections where workspace_id = $1', [foundation.workspace.id]);
    assert.equal(connection.rows[0].status, 'pending');
    assert.equal(connection.rows[0].external_account_id, null);
    assert.match(connection.rows[0].credential_ref, /^db:integration_credentials:/);

    const options = await listWritableGoogleCalendars(database, foundation.workspace.id, { env: ENV, fetchImpl });
    assert.equal(options.oauthConnected, true);
    assert.deepEqual(options.calendars.map((calendar) => calendar.name), ['Principal', 'Reservaciones']);
    await assert.rejects(
      completeGoogleCalendarOAuth(database, { state, cookieState: state, code: 'replay' }, { env: ENV, fetchImpl }),
      /google_oauth_state_invalid/,
    );
  } finally {
    await client.close();
  }
});

test('selects a writable calendar and creates an idempotent Retell appointment', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_google_booking',
      displayName: 'Google Booking',
      externalAgentId: 'agent_google_booking',
    });
    const start = await beginGoogleCalendarOAuth(database, {
      workspaceId: foundation.workspace.id,
      clerkUserId: 'user_google_admin',
    }, { env: ENV });
    const state = new URL(start.authorizationUrl).searchParams.get('state');
    let createdEvent = null;
    let createAttempts = 0;
    const fetchImpl = async (url, options = {}) => {
      const href = String(url);
      if (href === 'https://oauth2.googleapis.com/token') {
        const body = new URLSearchParams(options.body);
        return body.get('grant_type') === 'authorization_code'
          ? Response.json({ access_token: 'access-initial', refresh_token: 'refresh-booking', scope: SCOPES })
          : Response.json({ access_token: 'access-refreshed', expires_in: 3600 });
      }
      if (href.includes('/users/me/calendarList')) return Response.json(writableCalendars());
      if (href.includes('/calendars/team%40group.calendar.google.com/events') && options.method === 'POST') {
        createAttempts += 1;
        const body = JSON.parse(options.body);
        if (createAttempts > 1) return Response.json({ error: { message: 'Already exists' } }, { status: 409 });
        createdEvent = { ...body, htmlLink: 'https://calendar.google.com/event', status: 'confirmed' };
        return Response.json(createdEvent);
      }
      if (createdEvent && href.endsWith(`/events/${createdEvent.id}`) && !options.method) return Response.json(createdEvent);
      throw new Error(`unexpected_url:${href}:${options.method || 'GET'}`);
    };
    await completeGoogleCalendarOAuth(database, {
      state,
      cookieState: state,
      code: 'authorization-code',
    }, { env: ENV, fetchImpl });
    const selected = await selectGoogleCalendar(database, foundation.workspace.id, {
      calendarId: 'team@group.calendar.google.com',
    }, { env: ENV, fetchImpl });
    assert.equal(selected.name, 'Reservaciones');

    const request = {
      call: { call_id: 'call_google_1' },
      args: {
        action: 'create',
        calendarId: 'team@group.calendar.google.com',
        start: '2026-09-10T16:00:00.000Z',
        end: '2026-09-10T16:30:00.000Z',
        summary: 'Consulta de prueba',
        attendee: 'cliente@example.com',
      },
    };
    const first = await executeGoogleCalendarTool(database, foundation.workspace.id, request, { env: ENV, fetchImpl });
    const repeated = await executeGoogleCalendarTool(database, foundation.workspace.id, request, { env: ENV, fetchImpl });
    assert.equal(first.event.externalEventId, repeated.event.externalEventId);
    assert.match(first.event.externalEventId, /^a[0-9a-f]{64}$/);
    const appointments = await client.query('select external_event_id, status from app.appointments where workspace_id = $1', [foundation.workspace.id]);
    assert.equal(appointments.rows.length, 1);
    assert.equal(appointments.rows[0].status, 'confirmed');
  } finally {
    await client.close();
  }
});
