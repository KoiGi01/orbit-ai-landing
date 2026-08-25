import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  getWorkspaceFoundation,
  listIntegrationCatalog,
  markWebhookEventStatus,
  provisionMvpFoundation,
  provisionVoiceAgentDraft,
  provisionVoiceAgentFoundation,
  provisionWorkspaceFoundation,
  getWorkspaceActivity,
  listWorkspaceNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  recordWebhookEvent,
  resolveWebhookWorkspace,
  upsertCallAnalyzed,
  upsertCallEnded,
  upsertCallStarted,
  upsertGoogleCalendarConnection,
} from '../lib/server/crm-foundation.js';
import { databaseConfig } from '../lib/server/database.js';
import { inspectDatabaseHealth } from '../lib/server/database-health.js';

const MIGRATIONS_DIR = resolve('supabase/migrations');
const MIGRATION_FILES = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
const MIGRATIONS = await Promise.all(
  MIGRATION_FILES.map((name) => readFile(resolve(MIGRATIONS_DIR, name), 'utf8')),
);

async function applyMigrations(client) {
  for (const sql of MIGRATIONS) await client.exec(sql);
}

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
  await applyMigrations(client);
  return { client, database: pgliteAdapter(client) };
}

test('applies every migration repeatedly', async () => {
  const { client } = await migratedDatabase();
  try {
    await applyMigrations(client);
    const tables = await client.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'app'
      order by table_name
    `);
    assert.deepEqual(
      tables.rows.map((row) => row.table_name),
      [
        'audit_log',
        'calls',
        'contacts',
        'integration_connections',
        'integration_providers',
        'notifications',
        'tasks',
        'voice_agents',
        'webhook_events',
        'workspaces',
      ],
    );
  } finally {
    await client.close();
  }
});

test('provisions one workspace and keeps a Retell agent bound to one tenant', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const first = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_autivex_a',
      displayName: 'AutiveX Prueba A',
      timezone: 'America/Mexico_City',
      externalAgentId: 'agent_retell_a_123',
      externalAgentVersion: 'staging',
    });
    const repeated = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_autivex_a',
      displayName: 'AutiveX Prueba A',
      timezone: 'America/Mexico_City',
      externalAgentId: 'agent_retell_a_123',
      externalAgentVersion: 'staging',
    });

    assert.equal(repeated.workspace.id, first.workspace.id);
    assert.equal(repeated.voiceAgent.id, first.voiceAgent.id);

    const raceDatabase = {
      ...database,
      transaction(callback) {
        return database.transaction((transaction) => {
          let hidConflictingRead = false;
          return callback({
            ...transaction,
            query(text, parameters = []) {
              if (
                !hidConflictingRead
                && /select id, workspace_id\s+from app\.voice_agents/i.test(text)
              ) {
                hidConflictingRead = true;
                return Promise.resolve({ rows: [] });
              }
              return transaction.query(text, parameters);
            },
          });
        });
      },
    };

    await assert.rejects(
      provisionMvpFoundation(raceDatabase, {
        clerkOrganizationId: 'org_autivex_b',
        displayName: 'AutiveX Prueba B',
        timezone: 'America/Mexico_City',
        externalAgentId: 'agent_retell_a_123',
      }),
      /retell_agent_already_assigned/,
    );

    const workspaceA = await getWorkspaceFoundation(database, 'org_autivex_a');
    const workspaceB = await getWorkspaceFoundation(database, 'org_autivex_b');
    assert.equal(workspaceA.voiceAgents.length, 1);
    assert.equal(workspaceA.voiceAgents[0].externalAgentId, 'agent_retell_a_123');
    assert.equal(workspaceB, null);
  } finally {
    await client.close();
  }
});

test('creates a manual Clerk workspace before attaching its production Retell agent', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const workspace = await provisionWorkspaceFoundation(database, {
      clerkOrganizationId: 'org_manual_client',
      displayName: 'Negocio Manual',
      timezone: 'America/Mexico_City',
      settings: {
        ownerEmail: 'cliente@example.com',
        businessProfile: {
          industry: 'Servicios profesionales',
          schedulingProvider: 'google_calendar',
        },
      },
    });
    assert.equal(workspace.clerkOrganizationId, 'org_manual_client');
    assert.equal(workspace.settings.ownerEmail, 'cliente@example.com');

    const repeated = await provisionWorkspaceFoundation(database, {
      clerkOrganizationId: 'org_manual_client',
      displayName: 'Negocio Manual Actualizado',
      timezone: 'America/Mexico_City',
      settings: { acquisitionSource: 'local_sales' },
    });
    assert.equal(repeated.id, workspace.id);
    assert.equal(repeated.displayName, 'Negocio Manual Actualizado');
    assert.equal(repeated.settings.ownerEmail, 'cliente@example.com');
    assert.equal(repeated.settings.acquisitionSource, 'local_sales');

    const draftAgent = await provisionVoiceAgentDraft(database, {
      clerkOrganizationId: 'org_manual_client',
      externalAgentId: 'agent_draft_123',
      externalAgentVersion: '4',
      displayName: 'Lucía',
      settings: {
        retellLlmId: 'llm_draft_123',
        promptTemplateVersion: 'autivex-es-mx-v1',
      },
    });
    assert.equal(draftAgent.environment, 'staging');
    assert.equal(draftAgent.status, 'draft');
    assert.equal(draftAgent.settings.retellLlmId, 'llm_draft_123');

    const voiceAgent = await provisionVoiceAgentFoundation(database, {
      clerkOrganizationId: 'org_manual_client',
      externalAgentId: 'agent_manual_123',
      displayName: 'Lucía',
      assignedPhoneNumber: '+525512345678',
      fallbackPhoneNumber: '+525587654321',
      approvedTestCallId: 'call_manual_123',
      webhookVerified: true,
      fallbackTested: true,
    });
    assert.equal(voiceAgent.environment, 'production');
    assert.equal(voiceAgent.assignedPhoneNumber, '+525512345678');
    assert.equal(voiceAgent.fallbackPhoneNumber, '+525587654321');
    assert.equal(voiceAgent.webhookVerified, true);

    const foundation = await getWorkspaceFoundation(database, 'org_manual_client');
    assert.equal(foundation.workspace.settings.businessProfile.industry, 'Servicios profesionales');
    assert.equal(foundation.voiceAgents.length, 2);
    const productionAgent = foundation.voiceAgents.find((agent) => agent.environment === 'production');
    const savedDraftAgent = foundation.voiceAgents.find((agent) => agent.environment === 'staging');
    assert.equal(productionAgent.externalAgentId, 'agent_manual_123');
    assert.equal(productionAgent.approvedTestCallId, 'call_manual_123');
    assert.equal(savedDraftAgent.externalAgentId, 'agent_draft_123');
    assert.equal(savedDraftAgent.settings.promptTemplateVersion, 'autivex-es-mx-v1');

    const audit = await client.query(`
      select action
      from app.audit_log
      where workspace_id = $1
      order by created_at, action
    `, [workspace.id]);
    assert.deepEqual(
      audit.rows.map((row) => row.action).sort(),
      [
        'voice_agent.draft_created',
        'voice_agent.manual_provisioning_saved',
        'workspace.manual_onboarding_created',
      ],
    );
  } finally {
    await client.close();
  }
});

test('enforces tenant-safe call relationships and webhook idempotency', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const workspaceA = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_tenant_a',
      displayName: 'Tenant A',
      externalAgentId: 'agent_tenant_a_123',
    });
    const workspaceB = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_tenant_b',
      displayName: 'Tenant B',
      externalAgentId: 'agent_tenant_b_123',
    });

    const contactB = await client.query(
      `
        insert into app.contacts (workspace_id, display_name, phone_e164)
        values ($1, 'Persona B', '+525500000002')
        returning id
      `,
      [workspaceB.workspace.id],
    );

    await assert.rejects(
      client.query(
        `
          insert into app.calls (
            workspace_id,
            voice_agent_id,
            contact_id,
            external_call_id
          ) values ($1, $2, $3, 'call_cross_tenant')
        `,
        [workspaceA.workspace.id, workspaceA.voiceAgent.id, contactB.rows[0].id],
      ),
      /calls_contact_tenant|foreign key/i,
    );

    await client.query(
      `
        insert into app.webhook_events (
          workspace_id,
          provider,
          event_key,
          event_type,
          signature_verified_at,
          payload_sha256
        ) values ($1, 'retell', 'retell:call_analyzed:call_1', 'call_analyzed', now(), $2)
      `,
      [workspaceA.workspace.id, 'a'.repeat(64)],
    );

    await assert.rejects(
      client.query(
        `
          insert into app.webhook_events (
            workspace_id,
            provider,
            event_key,
            event_type,
            signature_verified_at
          ) values ($1, 'retell', 'retell:call_analyzed:call_1', 'call_analyzed', now())
        `,
        [workspaceA.workspace.id],
      ),
      /webhook_events_identity|unique/i,
    );
  } finally {
    await client.close();
  }
});

test('keeps integration credentials server-side and requires complete connected state', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_integrations',
      displayName: 'Integraciones MVP',
      externalAgentId: 'agent_integrations_123',
    });

    await assert.rejects(
      client.query(
        `
          insert into app.integration_connections (
            workspace_id,
            provider_key,
            status,
            created_by_clerk_user_id
          ) values ($1, 'google_calendar', 'connected', 'user_admin')
        `,
        [foundation.workspace.id],
      ),
      /integration_connections_connected_consistency|check/i,
    );

    await client.query(
      `
        insert into app.integration_connections (
          workspace_id,
          provider_key,
          status,
          external_account_id,
          display_name,
          credential_ref,
          connected_at,
          created_by_clerk_user_id,
          connected_by_clerk_user_id,
          is_primary
        ) values (
          $1,
          'google_calendar',
          'connected',
          'google-account-1',
          'Agenda principal',
          'vault://integration/google-account-1',
          now(),
          'user_admin',
          'user_admin',
          true
        )
      `,
      [foundation.workspace.id],
    );

    const view = await getWorkspaceFoundation(database, 'org_integrations');
    assert.equal(view.integrations[0].status, 'connected');
    assert.equal(view.integrations[0].displayName, 'Agenda principal');
    assert.equal('credentialRef' in view.integrations[0], false);

    const catalog = await listIntegrationCatalog(database);
    assert.deepEqual(catalog.map((provider) => provider.key), ['google_calendar']);
    assert.equal(catalog[0].authStrategy, 'manual');
  } finally {
    await client.close();
  }
});

test('fails database configuration safely when missing or exposed publicly', () => {
  assert.throws(() => databaseConfig({}), /missing_database_url/);
  assert.throws(
    () => databaseConfig({
      DATABASE_URL: 'postgresql://server-only',
      VITE_DATABASE_URL: 'postgresql://public',
    }),
    /public_database_configuration_forbidden:VITE_DATABASE_URL/,
  );
  assert.throws(
    () => databaseConfig({
      SUPABASE_PROJECT_REF: 'a'.repeat(20),
      SUPABASE_DB_PASSWORD: 'server-only',
      SUPABASE_DB_POOLER_HOST: 'aws-0-us-east-2.pooler.supabase.com',
      VITE_SUPABASE_DB_PASSWORD: 'public',
    }),
    /public_database_configuration_forbidden:VITE_SUPABASE_DB_PASSWORD/,
  );

  assert.deepEqual(
    databaseConfig({
      POSTGRES_URL: 'postgresql://vercel-supabase-integration',
      DATABASE_SSL: 'require',
    }),
    {
      url: 'postgresql://vercel-supabase-integration',
      sslMode: 'require',
      max: 5,
    },
  );

  assert.deepEqual(
    databaseConfig({
      DATABASE_URL: 'postgresql://server-only',
      DATABASE_SSL: 'require',
      DATABASE_POOL_MAX: '3',
    }),
    {
      url: 'postgresql://server-only',
      sslMode: 'require',
      max: 3,
    },
  );

  assert.deepEqual(
    databaseConfig({
      SUPABASE_PROJECT_REF: 'a'.repeat(20),
      SUPABASE_DB_PASSWORD: 'p@ss word',
      SUPABASE_DB_POOLER_HOST: 'aws-0-us-east-2.pooler.supabase.com',
      SUPABASE_DB_POOLER_PORT: '5432',
      DATABASE_SSL: 'require',
    }),
    {
      url: `postgresql://postgres.${'a'.repeat(20)}:p%40ss%20word@aws-0-us-east-2.pooler.supabase.com:5432/postgres`,
      sslMode: 'require',
      max: 5,
    },
  );
});

test('reports database connectivity without exposing connection details', async () => {
  const health = await inspectDatabaseHealth({
    async query(text) {
      assert.match(text, /current_database\(\)/);
      assert.match(text, /app\.schema_migrations/);
      return { rows: [{ database_name: 'postgres', schema_ready: true }] };
    },
  });

  assert.deepEqual(health, {
    ok: true,
    database: 'connected',
    schema: 'ready',
  });
  assert.equal(JSON.stringify(health).includes('postgres'), false);
});

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

test('allows a webhook event to be reprocessed after it was previously marked failed', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_webhook_retry',
      displayName: 'Webhook Retry',
      externalAgentId: 'agent_webhook_retry_123',
    });

    const id = await recordWebhookEvent(database, {
      workspaceId: foundation.workspace.id,
      eventKey: 'call_started:call_retry_1',
      eventType: 'call_started',
      externalObjectId: 'call_retry_1',
      payloadSha256: 'a'.repeat(64),
      safePayload: { event: 'call_started' },
    });
    assert.ok(id);

    await markWebhookEventStatus(database, id, 'failed', 'boom');

    const retried = await recordWebhookEvent(database, {
      workspaceId: foundation.workspace.id,
      eventKey: 'call_started:call_retry_1',
      eventType: 'call_started',
      externalObjectId: 'call_retry_1',
      payloadSha256: 'a'.repeat(64),
      safePayload: { event: 'call_started' },
    });
    assert.equal(retried, id);

    const row = await client.query(
      'select status, attempt_count from app.webhook_events where id = $1',
      [id],
    );
    assert.equal(row.rows[0].status, 'received');
    assert.equal(row.rows[0].attempt_count, 1);
  } finally {
    await client.close();
  }
});

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

test('call_started fills in a stub row created out-of-order by call_ended', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_out_of_order_started',
      displayName: 'Out Of Order Started',
      externalAgentId: 'agent_out_of_order_started_123',
    });

    const stubCallId = await upsertCallEnded(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_out_of_order_started_1',
      endedAt: '2026-08-22T10:03:00.000Z',
      durationSeconds: 42,
    });

    const stub = await client.query('select channel, contact_id from app.calls where id = $1', [stubCallId]);
    assert.equal(stub.rows[0].channel, 'web');
    assert.equal(stub.rows[0].contact_id, null);

    const startedCallId = await upsertCallStarted(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_out_of_order_started_1',
      channel: 'phone',
      direction: 'inbound',
      fromPhone: '+525511119999',
      startedAt: '2026-08-22T10:00:00.000Z',
    });
    assert.equal(startedCallId, stubCallId);

    const filled = await client.query('select channel, contact_id from app.calls where id = $1', [stubCallId]);
    assert.equal(filled.rows[0].channel, 'phone');
    assert.ok(filled.rows[0].contact_id);

    const contact = await client.query('select phone_e164 from app.contacts where id = $1', [filled.rows[0].contact_id]);
    assert.equal(contact.rows[0].phone_e164, '+525511119999');
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

    const call = await client.query('select status, urgency, follow_up_required, disposition from app.calls where id = $1', [callId]);
    assert.equal(call.rows[0].status, 'analyzed');
    assert.equal(call.rows[0].urgency, 'normal');
    assert.equal(call.rows[0].follow_up_required, false);
    assert.equal(call.rows[0].disposition, 'completed');

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

    const call = await client.query('select urgency, follow_up_required, disposition from app.calls where id = $1', [callId]);
    assert.equal(call.rows[0].urgency, 'urgent');
    assert.equal(call.rows[0].follow_up_required, true);
    assert.equal(call.rows[0].disposition, 'voicemail');

    const task = await client.query('select kind, priority from app.tasks where call_id = $1', [callId]);
    assert.equal(task.rows[0].kind, 'urgent_callback');
    assert.equal(task.rows[0].priority, 'urgent');
  } finally {
    await client.close();
  }
});

test('saves and re-saves a Google Calendar connection for a workspace', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_calendar_connection',
      displayName: 'Calendar Connection',
      externalAgentId: 'agent_calendar_connection_123',
    });

    const first = await upsertGoogleCalendarConnection(database, {
      clerkOrganizationId: 'org_calendar_connection',
      calendarId: 'clinic@group.calendar.google.com',
      displayName: 'Agenda principal',
      connectedByClerkUserId: 'user_admin',
    });
    assert.equal(first.calendarId, 'clinic@group.calendar.google.com');
    assert.equal(first.displayName, 'Agenda principal');
    assert.equal(first.status, 'connected');
    assert.ok(first.connectedAt);

    const row = await client.query(
      `select provider_key, connection_key, external_account_id, credential_ref, status from app.integration_connections where workspace_id = $1`,
      [foundation.workspace.id],
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].provider_key, 'google_calendar');
    assert.equal(row.rows[0].connection_key, 'primary');
    assert.equal(row.rows[0].external_account_id, 'clinic@group.calendar.google.com');
    assert.ok(row.rows[0].credential_ref);

    const second = await upsertGoogleCalendarConnection(database, {
      clerkOrganizationId: 'org_calendar_connection',
      calendarId: 'updated@group.calendar.google.com',
      displayName: 'Agenda actualizada',
      connectedByClerkUserId: 'user_admin',
    });
    assert.equal(second.id, first.id);
    assert.equal(second.calendarId, 'updated@group.calendar.google.com');

    const rowsAfterUpdate = await client.query(
      `select count(*)::int as count from app.integration_connections where workspace_id = $1`,
      [foundation.workspace.id],
    );
    assert.equal(rowsAfterUpdate.rows[0].count, 1);
  } finally {
    await client.close();
  }
});

test('rejects a calendar connection for a workspace that does not exist yet', async () => {
  const { client, database } = await migratedDatabase();
  try {
    await assert.rejects(
      upsertGoogleCalendarConnection(database, {
        clerkOrganizationId: 'org_missing_workspace',
        calendarId: 'clinic@group.calendar.google.com',
        displayName: 'Agenda principal',
        connectedByClerkUserId: 'user_admin',
      }),
      /workspace_not_provisioned/,
    );
  } finally {
    await client.close();
  }
});

test('returns an honest empty state for a workspace that has not been provisioned yet', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const activity = await getWorkspaceActivity(database, 'org_not_provisioned');
    assert.deepEqual(activity, { hasVoiceAgent: false, calls: [], tasks: [] });
  } finally {
    await client.close();
  }
});

test('returns an honest empty state for a provisioned workspace with zero calls', async () => {
  const { client, database } = await migratedDatabase();
  try {
    await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_no_activity_yet',
      displayName: 'No Activity Yet',
      externalAgentId: 'agent_no_activity_yet_123',
    });

    const activity = await getWorkspaceActivity(database, 'org_no_activity_yet');
    assert.deepEqual(activity, { hasVoiceAgent: true, calls: [], tasks: [] });
  } finally {
    await client.close();
  }
});

test('returns real calls and open tasks for a workspace, newest first, tenant-scoped', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_real_activity',
      displayName: 'Real Activity',
      externalAgentId: 'agent_real_activity_123',
    });
    const other = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_other_tenant',
      displayName: 'Other Tenant',
      externalAgentId: 'agent_other_tenant_123',
    });

    await upsertCallStarted(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_activity_1',
      channel: 'phone',
      direction: 'inbound',
      fromPhone: '+525511110001',
      startedAt: '2026-08-25T10:00:00.000Z',
    });
    await upsertCallAnalyzed(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_activity_1',
      summary: 'Cliente pidió una cita.',
      inVoicemail: false,
      callSuccessful: true,
      analysis: {},
    });

    await upsertCallStarted(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_activity_2',
      channel: 'phone',
      direction: 'inbound',
      fromPhone: '+525511110002',
      startedAt: '2026-08-25T11:00:00.000Z',
    });

    // Noise from a different tenant must never leak into this workspace's activity.
    await upsertCallStarted(database, {
      workspaceId: other.workspace.id,
      externalCallId: 'call_other_tenant_1',
      channel: 'phone',
      direction: 'inbound',
      fromPhone: '+525511119999',
      startedAt: '2026-08-25T09:00:00.000Z',
    });

    const activity = await getWorkspaceActivity(database, 'org_real_activity');
    assert.equal(activity.hasVoiceAgent, true);
    assert.equal(activity.calls.length, 2);
    // Newest first.
    assert.equal(activity.calls[0].externalCallId, 'call_activity_2');
    assert.equal(activity.calls[0].status, 'ongoing');
    assert.equal(activity.calls[0].contactPhone, '+525511110002');
    assert.equal(activity.calls[1].externalCallId, 'call_activity_1');
    assert.equal(activity.calls[1].status, 'analyzed');
    assert.equal(activity.calls[1].summary, 'Cliente pidió una cita.');

    assert.equal(activity.tasks.length, 1);
    assert.equal(activity.tasks[0].kind, 'review_call');
    assert.equal(activity.tasks[0].status, 'open');
    assert.equal(activity.tasks[0].contactPhone, '+525511110001');

    const otherActivity = await getWorkspaceActivity(database, 'org_other_tenant');
    assert.equal(otherActivity.calls.length, 1);
    assert.equal(otherActivity.calls[0].externalCallId, 'call_other_tenant_1');
  } finally {
    await client.close();
  }
});

test('excludes completed tasks from the open activity feed', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_completed_task',
      displayName: 'Completed Task',
      externalAgentId: 'agent_completed_task_123',
    });
    await upsertCallStarted(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_completed_task_1',
      channel: 'phone',
      direction: 'inbound',
      fromPhone: '+525511110003',
    });
    const { callId } = await upsertCallAnalyzed(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_completed_task_1',
      summary: 'Resuelto.',
      inVoicemail: false,
      callSuccessful: true,
      analysis: {},
    });
    await client.query(
      `update app.tasks set status = 'done', completed_at = now() where call_id = $1`,
      [callId],
    );

    const activity = await getWorkspaceActivity(database, 'org_completed_task');
    assert.equal(activity.tasks.length, 0);
    assert.equal(activity.calls.length, 1);
  } finally {
    await client.close();
  }
});

test('creates one notification per new task and none on redelivery', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_notifications',
      displayName: 'Notifications',
      externalAgentId: 'agent_notifications_123',
    });
    await upsertCallStarted(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_notif_1',
      channel: 'phone',
      direction: 'inbound',
      fromPhone: '+525511110004',
    });

    const analyzeOnce = () => upsertCallAnalyzed(database, {
      workspaceId: foundation.workspace.id,
      externalCallId: 'call_notif_1',
      summary: 'Pidió una cita para mañana.',
      inVoicemail: false,
      callSuccessful: true,
      analysis: {},
    });
    await analyzeOnce();
    await analyzeOnce(); // simulates Retell redelivering the same event

    const { notifications, unreadCount } = await listWorkspaceNotifications(database, 'org_notifications');
    assert.equal(notifications.length, 1);
    assert.equal(unreadCount, 1);
    assert.equal(notifications[0].kind, 'task_created');
    assert.match(notifications[0].title, /Pidió una cita/);
    assert.equal(notifications[0].readAt, null);
    assert.ok(notifications[0].taskId);
    assert.ok(notifications[0].callId);
  } finally {
    await client.close();
  }
});

test('marks one notification read and all notifications read, tenant-scoped', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const foundation = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_notif_read',
      displayName: 'Notif Read',
      externalAgentId: 'agent_notif_read_123',
    });
    const other = await provisionMvpFoundation(database, {
      clerkOrganizationId: 'org_notif_other',
      displayName: 'Notif Other',
      externalAgentId: 'agent_notif_other_123',
    });

    for (const externalCallId of ['call_notif_read_1', 'call_notif_read_2']) {
      await upsertCallStarted(database, { workspaceId: foundation.workspace.id, externalCallId, channel: 'web', direction: 'inbound' });
      await upsertCallAnalyzed(database, { workspaceId: foundation.workspace.id, externalCallId, summary: 'Llamada de prueba.', inVoicemail: false, callSuccessful: true, analysis: {} });
    }
    await upsertCallStarted(database, { workspaceId: other.workspace.id, externalCallId: 'call_notif_other_1', channel: 'web', direction: 'inbound' });
    await upsertCallAnalyzed(database, { workspaceId: other.workspace.id, externalCallId: 'call_notif_other_1', summary: 'Otro tenant.', inVoicemail: false, callSuccessful: true, analysis: {} });

    const before = await listWorkspaceNotifications(database, 'org_notif_read');
    assert.equal(before.notifications.length, 2);
    assert.equal(before.unreadCount, 2);

    const afterOne = await markNotificationRead(database, { clerkOrganizationId: 'org_notif_read', notificationId: before.notifications[0].id });
    assert.equal(afterOne.unreadCount, 1);
    assert.ok(afterOne.notifications.find((item) => item.id === before.notifications[0].id).readAt);

    const afterAll = await markAllNotificationsRead(database, 'org_notif_read');
    assert.equal(afterAll.unreadCount, 0);
    assert.ok(afterAll.notifications.every((item) => item.readAt));

    // The other tenant's notification must be untouched by any of the above.
    const otherView = await listWorkspaceNotifications(database, 'org_notif_other');
    assert.equal(otherView.unreadCount, 1);
  } finally {
    await client.close();
  }
});

test('returns an empty notifications view for a workspace that does not exist yet', async () => {
  const { client, database } = await migratedDatabase();
  try {
    const view = await listWorkspaceNotifications(database, 'org_no_notifications_workspace');
    assert.deepEqual(view, { notifications: [], unreadCount: 0 });
  } finally {
    await client.close();
  }
});
