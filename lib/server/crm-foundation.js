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
    settings: row.settings || {},
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
    assignedPhoneNumber: row.assigned_phone_e164 || null,
    fallbackPhoneNumber: row.fallback_phone_e164 || null,
    approvedTestCallId: row.approved_test_call_id || null,
    settings: row.settings || {},
  };
}

function jsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

export async function provisionWorkspaceFoundation(database, raw = {}) {
  const input = {
    clerkOrganizationId: clerkOrganizationId(raw.clerkOrganizationId),
    displayName: requiredText(raw.displayName, 160, 'missing_workspace_name'),
    timezone: timezone(raw.timezone),
    settings: jsonObject(raw.settings),
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
          status,
          settings
        ) values ($1, $2, $3, $4, 'es-MX', 'testing', $5::text::jsonb)
        on conflict (clerk_organization_id) do update
        set display_name = excluded.display_name,
            timezone = excluded.timezone,
            settings = app.workspaces.settings || excluded.settings,
            updated_at = now()
        returning id, clerk_organization_id, display_name, timezone, locale, status, settings
      `,
      [
        randomUUID(),
        input.clerkOrganizationId,
        input.displayName,
        input.timezone,
        JSON.stringify(input.settings),
      ],
    );
    const workspace = workspaceResult.rows[0];

    await transaction.query(
      `
        insert into app.audit_log (
          id,
          workspace_id,
          action,
          target_type,
          target_id,
          metadata
        )
        select $1::uuid, $2::uuid, 'workspace.manual_onboarding_created', 'workspace', $2::text, $3::text::jsonb
        where not exists (
          select 1
          from app.audit_log
          where workspace_id = $2::uuid
            and action = 'workspace.manual_onboarding_created'
            and target_id = $2::text
        )
      `,
      [
        randomUUID(),
        workspace.id,
        JSON.stringify({ source: 'internal_admin' }),
      ],
    );

    return serializeWorkspace(workspace);
  });
}

export async function provisionVoiceAgentDraft(database, raw = {}) {
  const input = {
    clerkOrganizationId: clerkOrganizationId(raw.clerkOrganizationId),
    externalAgentId: retellAgentId(raw.externalAgentId),
    externalAgentVersion: cleanText(raw.externalAgentVersion, 80) || null,
    displayName: cleanText(raw.displayName, 120) || 'Lucía',
    settings: jsonObject(raw.settings),
  };

  return database.transaction(async (transaction) => {
    const workspaceResult = await transaction.query(
      `
        select id
        from app.workspaces
        where clerk_organization_id = $1 and archived_at is null
        limit 1
      `,
      [input.clerkOrganizationId],
    );
    const workspace = workspaceResult.rows[0];
    if (!workspace) throw new Error('workspace_not_provisioned');

    const assignedResult = await transaction.query(
      `
        select id, workspace_id
        from app.voice_agents
        where provider = 'retell' and external_agent_id = $1
        limit 1
      `,
      [input.externalAgentId],
    );
    const assigned = assignedResult.rows[0];
    if (assigned && assigned.workspace_id !== workspace.id) {
      throw new Error('retell_agent_already_assigned');
    }

    await transaction.query(
      `
        update app.voice_agents
        set is_default = false, updated_at = now()
        where workspace_id = $1
          and provider = 'retell'
          and environment = 'staging'
          and external_agent_id <> $2
          and is_default = true
          and archived_at is null
      `,
      [workspace.id, input.externalAgentId],
    );

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
          is_default,
          settings
        ) values ($1, $2, 'retell', $3, $4, $5, 'staging', 'draft', true, $6::text::jsonb)
        on conflict (provider, external_agent_id) do update
        set external_agent_version = excluded.external_agent_version,
            display_name = excluded.display_name,
            environment = 'staging',
            status = 'draft',
            is_default = true,
            settings = app.voice_agents.settings || excluded.settings,
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
          webhook_verified,
          assigned_phone_e164,
          fallback_phone_e164,
          approved_test_call_id,
          settings
      `,
      [
        assigned?.id || randomUUID(),
        workspace.id,
        input.externalAgentId,
        input.externalAgentVersion,
        input.displayName,
        JSON.stringify(input.settings),
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
        )
        select $1::uuid, $2::uuid, 'voice_agent.draft_created', 'voice_agent', $3::text, $4::text::jsonb
        where not exists (
          select 1
          from app.audit_log
          where workspace_id = $2::uuid
            and action = 'voice_agent.draft_created'
            and target_id = $3::text
        )
      `,
      [
        randomUUID(),
        workspace.id,
        agent.id,
        JSON.stringify({
          provider: 'retell',
          environment: 'staging',
          promptTemplateVersion: input.settings.promptTemplateVersion || null,
        }),
      ],
    );

    return serializeVoiceAgent(agent);
  });
}

export async function provisionVoiceAgentFoundation(database, raw = {}) {
  const input = {
    clerkOrganizationId: clerkOrganizationId(raw.clerkOrganizationId),
    externalAgentId: retellAgentId(raw.externalAgentId),
    externalAgentVersion: cleanText(raw.externalAgentVersion, 80) || null,
    displayName: cleanText(raw.displayName, 120) || 'Lucía',
    assignedPhoneNumber: requiredText(raw.assignedPhoneNumber, 40, 'missing_assigned_phone_number'),
    fallbackPhoneNumber: requiredText(raw.fallbackPhoneNumber, 40, 'missing_fallback_phone_number'),
    approvedTestCallId: requiredText(raw.approvedTestCallId, 128, 'missing_approved_test_call_id'),
    webhookVerified: raw.webhookVerified === true,
    fallbackTested: raw.fallbackTested === true,
  };

  return database.transaction(async (transaction) => {
    const workspaceResult = await transaction.query(
      `
        select id
        from app.workspaces
        where clerk_organization_id = $1 and archived_at is null
        limit 1
      `,
      [input.clerkOrganizationId],
    );
    const workspace = workspaceResult.rows[0];
    if (!workspace) throw new Error('workspace_not_provisioned');

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

    await transaction.query(
      `
        update app.voice_agents
        set is_default = false, updated_at = now()
        where workspace_id = $1
          and provider = 'retell'
          and environment = 'production'
          and external_agent_id <> $2
          and is_default = true
          and archived_at is null
      `,
      [workspace.id, input.externalAgentId],
    );

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
          is_default,
          assigned_phone_e164,
          fallback_phone_e164,
          approved_test_call_id,
          webhook_verified,
          settings
        ) values ($1, $2, 'retell', $3, $4, $5, 'production', 'testing', true, $6, $7, $8, $9, $10::text::jsonb)
        on conflict (provider, external_agent_id) do update
        set external_agent_version = excluded.external_agent_version,
            display_name = excluded.display_name,
            environment = 'production',
            status = 'testing',
            is_default = true,
            assigned_phone_e164 = excluded.assigned_phone_e164,
            fallback_phone_e164 = excluded.fallback_phone_e164,
            approved_test_call_id = excluded.approved_test_call_id,
            webhook_verified = excluded.webhook_verified,
            settings = app.voice_agents.settings || excluded.settings,
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
          webhook_verified,
          assigned_phone_e164,
          fallback_phone_e164,
          approved_test_call_id
      `,
      [
        existingAgent?.id || randomUUID(),
        workspace.id,
        input.externalAgentId,
        input.externalAgentVersion,
        input.displayName,
        input.assignedPhoneNumber,
        input.fallbackPhoneNumber,
        input.approvedTestCallId,
        input.webhookVerified,
        JSON.stringify({ fallbackTested: input.fallbackTested }),
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
        ) values ($1, $2, 'voice_agent.manual_provisioning_saved', 'voice_agent', $3, $4::text::jsonb)
      `,
      [
        randomUUID(),
        workspace.id,
        agent.id,
        JSON.stringify({
          provider: 'retell',
          environment: 'production',
          webhookVerified: input.webhookVerified,
          fallbackTested: input.fallbackTested,
        }),
      ],
    );

    return serializeVoiceAgent(agent);
  });
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
        ) values ($1, $2, 'workspace.mvp_foundation_provisioned', 'voice_agent', $3, $4::text::jsonb)
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveWebhookWorkspace(database, rawWorkspaceId) {
  const workspaceId = String(rawWorkspaceId || '').trim();
  if (!UUID_RE.test(workspaceId)) return null;
  const result = await database.query(
    `
      select id
      from app.workspaces
      where id = $1::uuid and archived_at is null
      limit 1
    `,
    [workspaceId],
  );
  return result.rows[0]?.id || null;
}

export async function recordWebhookEvent(database, raw = {}) {
  const result = await database.query(
    `
      insert into app.webhook_events (
        workspace_id,
        provider,
        event_key,
        event_type,
        external_object_id,
        signature_verified_at,
        payload_sha256,
        safe_payload
      ) values ($1, 'retell', $2, $3, $4, now(), $5, $6::text::jsonb)
      on conflict (provider, event_key) do nothing
      returning id
    `,
    [
      raw.workspaceId,
      raw.eventKey,
      raw.eventType,
      raw.externalObjectId || null,
      raw.payloadSha256 || null,
      JSON.stringify(raw.safePayload || {}),
    ],
  );
  return result.rows[0]?.id || null;
}

export async function markWebhookEventStatus(database, id, status, errorCode = null) {
  await database.query(
    `
      update app.webhook_events
      set status = $2,
          last_error_code = $3,
          processed_at = case when $2 in ('processed', 'ignored') then now() else processed_at end
      where id = $1
    `,
    [id, status, errorCode],
  );
}

export async function getWorkspaceFoundation(database, rawClerkOrganizationId) {
  const organizationId = clerkOrganizationId(rawClerkOrganizationId);
  const workspaceResult = await database.query(
    `
      select id, clerk_organization_id, display_name, timezone, locale, status, settings
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
          webhook_verified,
          assigned_phone_e164,
          fallback_phone_e164,
          approved_test_call_id,
          settings
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
