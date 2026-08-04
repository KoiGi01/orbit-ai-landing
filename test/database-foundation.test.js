import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  getWorkspaceFoundation,
  listIntegrationCatalog,
  provisionMvpFoundation,
} from '../lib/server/crm-foundation.js';
import { databaseConfig } from '../lib/server/database.js';
import { inspectDatabaseHealth } from '../lib/server/database-health.js';

const MIGRATION_PATH = resolve('db/migrations/0001_crm_and_integrations.sql');
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

test('applies the CRM and integrations migration repeatedly', async () => {
  const { client } = await migratedDatabase();
  try {
    await client.exec(MIGRATION);
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
        'integration_oauth_states',
        'integration_providers',
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
    assert.deepEqual(
      catalog.map((provider) => provider.key).sort(),
      ['calendly', 'custom_webhook', 'google_calendar', 'whatsapp_business'],
    );
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
