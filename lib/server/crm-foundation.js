import { randomUUID } from 'node:crypto';
import { cleanText } from './lead-delivery.js';

function requiredText(value, max, errorCode) {
  const text = cleanText(value, max);
  if (!text) throw new Error(errorCode);
  return text;
}

function clerkOrganizationId(value) {
  const id = requiredText(value, 132, 'missing_clerk_organization_id');
  if (!/^org_[A-Za-z0-9_-]{3,128}$/.test(id)) throw new Error('invalid_clerk_organization_id');
  return id;
}

function retellAgentId(value) {
  const id = requiredText(value, 128, 'missing_retell_agent_id');
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) throw new Error('invalid_retell_agent_id');
  return id;
}

function timezone(value) {
  const zone = cleanText(value, 80) || 'America/Mexico_City';
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(zone)) throw new Error('invalid_timezone');
  return zone;
}

function serializeWorkspace(row) {
  if (!row) return null;
  return {
    id: row.id,
    clerkOrganizationId: row.clerk_organization_id,
    displayName: row.display_name,
    timezone: row.timezone,
    locale: row.locale,
    status: row.status,
  };
}

function serializeVoiceAgent(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    externalAgentId: row.external_agent_id,
    externalAgentVersion: row.external_agent_version,
    displayName: row.display_name,
    environment: row.environment,
    status: row.status,
    isDefault: row.is_default,
    webhookVerified: row.webhook_verified,
  };
}

export async function provisionMvpFoundation(database, raw = {}) {
  const input = {
    clerkOrganizationId: clerkOrganizationId(raw.clerkOrganizationId),
    displayName: requiredText(raw.displayName, 160, 'missing_workspace_name'),
    timezone: timezone(raw.timezone),
    externalAgentId: retellAgentId(raw.externalAgentId),
    externalAgentVersion: cleanText(raw.externalAgentVersion, 80) || null,
    agentDisplayName: cleanText(raw.agentDisplayName, 120) || 'Lucía MVP',
  };

  return database.transaction(async (transaction) => {
    const workspaceResult = await transaction.query(
      `
        insert into app.workspaces (
          id,
          clerk_organization_id,
          display_name,
          timezone,
          locale,
          status
        ) values ($1, $2, $3, $4, 'es-MX', 'testing')
        on conflict (clerk_organization_id) do update
        set display_name = excluded.display_name,
            timezone = excluded.timezone,
            updated_at = now()
        returning id, clerk_organization_id, display_name, timezone, locale, status
      `,
      [randomUUID(), input.clerkOrganizationId, input.displayName, input.timezone],
    );
    const workspace = workspaceResult.rows[0];

    const existingAgentResult = await transaction.query(
      `
        select id, workspace_id
        from app.voice_agents
        where provider = 'retell' and external_agent_id = $1
        limit 1
      `,
      [input.externalAgentId],
    );
    const existingAgent = existingAgentResult.rows[0];
    if (existingAgent && existingAgent.workspace_id !== workspace.id) {
      throw new Error('retell_agent_already_assigned');
    }

    const agentResult = await transaction.query(
      `
        insert into app.voice_agents (
          id,
          workspace_id,
          provider,
          external_agent_id,
          external_agent_version,
          display_name,
          environment,
          status,
          is_default
        ) values ($1, $2, 'retell', $3, $4, $5, 'demo', 'testing', true)
        on conflict (provider, external_agent_id) do update
        set external_agent_version = excluded.external_agent_version,
            display_name = excluded.display_name,
            status = 'testing',
            is_default = true,
            updated_at = now()
        where voice_agents.workspace_id = excluded.workspace_id
        returning
          id,
          workspace_id,
          provider,
          external_agent_id,
          external_agent_version,
          display_name,
          environment,
          status,
          is_default,
          webhook_verified
      `,
      [
        existingAgent?.id || randomUUID(),
        workspace.id,
        input.externalAgentId,
        input.externalAgentVersion,
        input.agentDisplayName,
      ],
    );
    const agent = agentResult.rows[0];
    if (!agent) throw new Error('retell_agent_already_assigned');

    await transaction.query(
      `
        insert into app.audit_log (
          id,
          workspace_id,
          action,
          target_type,
          target_id,
          metadata
        ) values ($1, $2, 'workspace.mvp_foundation_provisioned', 'voice_agent', $3, $4::jsonb)
      `,
      [
        randomUUID(),
        workspace.id,
        agent.id,
        JSON.stringify({ provider: 'retell', environment: 'demo' }),
      ],
    );

    return {
      workspace: serializeWorkspace(workspace),
      voiceAgent: serializeVoiceAgent(agent),
    };
  });
}

export async function getWorkspaceFoundation(database, rawClerkOrganizationId) {
  const organizationId = clerkOrganizationId(rawClerkOrganizationId);
  const workspaceResult = await database.query(
    `
      select id, clerk_organization_id, display_name, timezone, locale, status
      from app.workspaces
      where clerk_organization_id = $1 and archived_at is null
      limit 1
    `,
    [organizationId],
  );
  const workspace = workspaceResult.rows[0];
  if (!workspace) return null;

  const [agentsResult, connectionsResult] = await Promise.all([
    database.query(
      `
        select
          id,
          workspace_id,
          provider,
          external_agent_id,
          external_agent_version,
          display_name,
          environment,
          status,
          is_default,
          webhook_verified
        from app.voice_agents
        where workspace_id = $1 and archived_at is null
        order by is_default desc, created_at asc
      `,
      [workspace.id],
    ),
    database.query(
      `
        select
          id,
          provider_key,
          connection_key,
          display_name,
          status,
          is_primary,
          scopes,
          capabilities,
          connected_at,
          last_verified_at,
          last_error_code
        from app.integration_connections
        where workspace_id = $1 and archived_at is null
        order by provider_key, connection_key
      `,
      [workspace.id],
    ),
  ]);

  return {
    workspace: serializeWorkspace(workspace),
    voiceAgents: agentsResult.rows.map(serializeVoiceAgent),
    integrations: connectionsResult.rows.map((row) => ({
      id: row.id,
      provider: row.provider_key,
      connectionKey: row.connection_key,
      displayName: row.display_name,
      status: row.status,
      isPrimary: row.is_primary,
      scopes: row.scopes || [],
      capabilities: row.capabilities || [],
      connectedAt: row.connected_at,
      lastVerifiedAt: row.last_verified_at,
      lastErrorCode: row.last_error_code,
    })),
  };
}

export async function listIntegrationCatalog(database) {
  const result = await database.query(
    `
      select key, display_name, category, auth_strategy, capabilities
      from app.integration_providers
      where enabled = true
      order by category, display_name
    `,
  );

  return result.rows.map((row) => ({
    key: row.key,
    displayName: row.display_name,
    category: row.category,
    authStrategy: row.auth_strategy,
    capabilities: row.capabilities || [],
  }));
}
