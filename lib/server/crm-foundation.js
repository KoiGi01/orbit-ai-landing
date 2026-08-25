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

function phoneOrNull(value) {
  const text = cleanText(value, 40);
  return /^[+][1-9][0-9]{7,14}$/.test(text) ? text : null;
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
      on conflict (provider, event_key) do update
      set status = 'received',
          attempt_count = app.webhook_events.attempt_count + 1,
          signature_verified_at = excluded.signature_verified_at
      where app.webhook_events.status = 'failed'
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

export async function upsertCallStarted(database, raw = {}) {
  const workspaceId = raw.workspaceId;
  const externalCallId = requiredText(raw.externalCallId, 128, 'missing_external_call_id');
  const channel = raw.channel === 'phone' ? 'phone' : 'web';
  const direction = raw.direction === 'outbound' ? 'outbound' : 'inbound';
  const fromPhone = phoneOrNull(raw.fromPhone);
  const toPhone = phoneOrNull(raw.toPhone);
  const startedAt = raw.startedAt || null;

  return database.transaction(async (transaction) => {
    const existing = await transaction.query(
      `
        select id, channel, contact_id, from_phone_e164, to_phone_e164, started_at
        from app.calls
        where workspace_id = $1 and provider = 'retell' and external_call_id = $2
        limit 1
      `,
      [workspaceId, externalCallId],
    );
    const existingRow = existing.rows[0];

    async function upsertContact() {
      const customerPhone = direction === 'outbound' ? toPhone : fromPhone;
      if (!customerPhone) return null;
      const contact = await transaction.query(
        `
          insert into app.contacts (workspace_id, phone_e164, source)
          values ($1, $2, 'voice_call')
          on conflict (workspace_id, phone_e164) where phone_e164 is not null and archived_at is null
          do update set last_contacted_at = now(), updated_at = now()
          returning id
        `,
        [workspaceId, customerPhone],
      );
      return contact.rows[0]?.id || null;
    }

    if (existingRow) {
      // A stub row can already exist from an out-of-order call_ended/call_analyzed
      // event: channel is still at its default ('web') and none of the identity
      // fields call_started would populate have been recorded yet. Only in that
      // case is this genuinely a stub for call_started to fill in — a row already
      // populated by a real prior call_started (channel moved off 'web', or any
      // identity field already recorded) is left untouched so a redelivery can
      // never clobber already-correct data.
      const isUnfilledStub = existingRow.channel === 'web'
        && !existingRow.from_phone_e164
        && !existingRow.to_phone_e164
        && !existingRow.started_at;

      if (!isUnfilledStub) return existingRow.id;

      let contactId = existingRow.contact_id;
      if (channel === 'phone' && !contactId) {
        contactId = await upsertContact();
      }

      await transaction.query(
        `
          update app.calls
          set channel = $2,
              direction = $3,
              from_phone_e164 = coalesce(from_phone_e164, $4),
              to_phone_e164 = coalesce(to_phone_e164, $5),
              started_at = coalesce(started_at, $6),
              contact_id = coalesce(contact_id, $7),
              updated_at = now()
          where id = $1
        `,
        [existingRow.id, channel, direction, fromPhone, toPhone, startedAt, contactId],
      );
      return existingRow.id;
    }

    let contactId = null;
    if (channel === 'phone') {
      contactId = await upsertContact();
    }

    const call = await transaction.query(
      `
        insert into app.calls (
          workspace_id, contact_id, provider, external_call_id,
          channel, direction, status, from_phone_e164, to_phone_e164, started_at
        ) values ($1, $2, 'retell', $3, $4, $5, 'ongoing', $6, $7, $8)
        returning id
      `,
      [workspaceId, contactId, externalCallId, channel, direction, fromPhone, toPhone, startedAt],
    );
    return call.rows[0].id;
  });
}

export async function upsertCallEnded(database, raw = {}) {
  const workspaceId = raw.workspaceId;
  const externalCallId = requiredText(raw.externalCallId, 128, 'missing_external_call_id');
  const endedAt = raw.endedAt || null;
  const durationSeconds = Number.isFinite(raw.durationSeconds) ? Math.max(0, Math.round(raw.durationSeconds)) : null;

  return database.transaction(async (transaction) => {
    const existing = await transaction.query(
      `select id from app.calls where workspace_id = $1 and provider = 'retell' and external_call_id = $2 limit 1`,
      [workspaceId, externalCallId],
    );

    if (!existing.rows[0]) {
      const inserted = await transaction.query(
        `
          insert into app.calls (workspace_id, provider, external_call_id, status, ended_at, duration_seconds)
          values ($1, 'retell', $2, 'ended', $3, $4)
          returning id
        `,
        [workspaceId, externalCallId, endedAt, durationSeconds],
      );
      return inserted.rows[0].id;
    }

    const updated = await transaction.query(
      `
        update app.calls
        set status = 'ended', ended_at = $2, duration_seconds = $3, updated_at = now()
        where id = $1
        returning id
      `,
      [existing.rows[0].id, endedAt, durationSeconds],
    );
    return updated.rows[0].id;
  });
}

export async function upsertCallAnalyzed(database, raw = {}) {
  const workspaceId = raw.workspaceId;
  const externalCallId = requiredText(raw.externalCallId, 128, 'missing_external_call_id');
  const summary = cleanText(raw.summary, 2000) || null;
  const inVoicemail = raw.inVoicemail === true;
  const callSuccessful = raw.callSuccessful;
  const analysis = jsonObject(raw.analysis);
  const urgency = inVoicemail ? 'urgent' : callSuccessful === false ? 'high' : 'normal';
  const disposition = inVoicemail ? 'voicemail' : callSuccessful === false ? 'unsuccessful' : 'completed';
  const followUpRequired = inVoicemail || callSuccessful === false;

  return database.transaction(async (transaction) => {
    const existing = await transaction.query(
      `select id, contact_id from app.calls where workspace_id = $1 and provider = 'retell' and external_call_id = $2 limit 1`,
      [workspaceId, externalCallId],
    );

    let callId;
    let contactId = null;
    if (existing.rows[0]) {
      callId = existing.rows[0].id;
      contactId = existing.rows[0].contact_id;
      await transaction.query(
        `
          update app.calls
          set status = 'analyzed', summary = $2, urgency = $3, follow_up_required = $4,
              disposition = $5, analysis = $6::text::jsonb, updated_at = now()
          where id = $1
        `,
        [callId, summary, urgency, followUpRequired, disposition, JSON.stringify(analysis)],
      );
    } else {
      const inserted = await transaction.query(
        `
          insert into app.calls (
            workspace_id, provider, external_call_id, status,
            summary, urgency, follow_up_required, disposition, analysis
          ) values ($1, 'retell', $2, 'analyzed', $3, $4, $5, $6, $7::text::jsonb)
          returning id
        `,
        [workspaceId, externalCallId, summary, urgency, followUpRequired, disposition, JSON.stringify(analysis)],
      );
      callId = inserted.rows[0].id;
    }

    const kind = inVoicemail ? 'urgent_callback' : 'review_call';
    const priority = inVoicemail ? 'urgent' : callSuccessful === false ? 'high' : 'normal';
    const title = cleanText(`Revisar llamada${summary ? `: ${summary}` : ''}`, 180);

    const taskResult = await transaction.query(
      `
        insert into app.tasks (
          workspace_id, contact_id, call_id, kind, title, description, priority, dedupe_key
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (workspace_id, dedupe_key) where dedupe_key is not null
        do nothing
        returning id
      `,
      [workspaceId, contactId, callId, kind, title, summary, priority, `call:${externalCallId}:review`],
    );

    // Only on a genuinely new task -- a redelivered call_analyzed event hits
    // the ON CONFLICT DO NOTHING above and returns no row, so it must not
    // create a second notification for the same call.
    const taskId = taskResult.rows[0]?.id || null;
    if (taskId) {
      await transaction.query(
        `
          insert into app.notifications (
            workspace_id, kind, title, body, task_id, call_id
          ) values ($1, 'task_created', $2, $3, $4, $5)
        `,
        [workspaceId, title, summary, taskId, callId],
      );
    }

    return { callId };
  });
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

export async function upsertGoogleCalendarConnection(database, raw = {}) {
  const input = {
    clerkOrganizationId: clerkOrganizationId(raw.clerkOrganizationId),
    calendarId: requiredText(raw.calendarId, 240, 'missing_calendar_id'),
    displayName: cleanText(raw.displayName, 100) || 'Google Calendar',
    connectedByClerkUserId: requiredText(raw.connectedByClerkUserId, 80, 'missing_connected_by'),
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

    const connectionResult = await transaction.query(
      `
        insert into app.integration_connections (
          workspace_id, provider_key, connection_key, external_account_id, display_name,
          status, is_primary, capabilities, credential_ref, connected_at,
          created_by_clerk_user_id, connected_by_clerk_user_id
        ) values (
          $1, 'google_calendar', 'primary', $2, $3,
          'connected', true, array['availability.read', 'appointments.read', 'appointments.write'],
          'shared:autivex-service-account', now(), $4, $4
        )
        on conflict (workspace_id, provider_key, connection_key) do update
        set external_account_id = excluded.external_account_id,
            display_name = excluded.display_name,
            status = 'connected',
            credential_ref = excluded.credential_ref,
            connected_at = excluded.connected_at,
            connected_by_clerk_user_id = excluded.connected_by_clerk_user_id,
            updated_at = now()
        returning id, external_account_id, display_name, status, connected_at
      `,
      [workspace.id, input.calendarId, input.displayName, input.connectedByClerkUserId],
    );
    const connection = connectionResult.rows[0];

    return {
      id: connection.id,
      calendarId: connection.external_account_id,
      displayName: connection.display_name,
      status: connection.status,
      connectedAt: connection.connected_at,
    };
  });
}

function serializeActivityCall(row) {
  return {
    id: row.id,
    externalCallId: row.external_call_id,
    status: row.status,
    channel: row.channel,
    direction: row.direction,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    summary: row.summary,
    disposition: row.disposition,
    urgency: row.urgency,
    followUpRequired: row.follow_up_required,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
  };
}

function serializeActivityTask(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    dueAt: row.due_at,
    callId: row.call_id,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
  };
}

export async function getWorkspaceActivity(database, rawClerkOrganizationId) {
  const orgId = clerkOrganizationId(rawClerkOrganizationId);
  const workspaceResult = await database.query(
    `
      select id
      from app.workspaces
      where clerk_organization_id = $1 and archived_at is null
      limit 1
    `,
    [orgId],
  );
  const workspace = workspaceResult.rows[0];
  if (!workspace) return { hasVoiceAgent: false, calls: [], tasks: [] };

  const [agentResult, callsResult, tasksResult] = await Promise.all([
    database.query(
      `
        select id
        from app.voice_agents
        where workspace_id = $1 and archived_at is null
        limit 1
      `,
      [workspace.id],
    ),
    database.query(
      `
        select
          c.id, c.external_call_id, c.status, c.channel, c.direction,
          c.started_at, c.ended_at, c.duration_seconds,
          c.summary, c.disposition, c.urgency, c.follow_up_required,
          ct.display_name as contact_name, ct.phone_e164 as contact_phone
        from app.calls c
        left join app.contacts ct on ct.id = c.contact_id
        where c.workspace_id = $1
        order by coalesce(c.started_at, c.created_at) desc, c.created_at desc
        limit 20
      `,
      [workspace.id],
    ),
    database.query(
      `
        select
          t.id, t.kind, t.title, t.description, t.priority, t.status, t.due_at, t.call_id,
          ct.display_name as contact_name, ct.phone_e164 as contact_phone
        from app.tasks t
        left join app.contacts ct on ct.id = t.contact_id
        where t.workspace_id = $1 and t.status in ('open', 'in_progress')
        order by
          case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
          t.due_at asc nulls last,
          t.created_at asc
        limit 50
      `,
      [workspace.id],
    ),
  ]);

  return {
    hasVoiceAgent: Boolean(agentResult.rows[0]),
    calls: callsResult.rows.map(serializeActivityCall),
    tasks: tasksResult.rows.map(serializeActivityTask),
  };
}

function serializeNotification(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    taskId: row.task_id,
    callId: row.call_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

async function resolveNotificationWorkspaceId(database, rawClerkOrganizationId) {
  const orgId = clerkOrganizationId(rawClerkOrganizationId);
  const result = await database.query(
    `select id from app.workspaces where clerk_organization_id = $1 and archived_at is null limit 1`,
    [orgId],
  );
  return result.rows[0]?.id || null;
}

export async function listWorkspaceNotifications(database, rawClerkOrganizationId) {
  const workspaceId = await resolveNotificationWorkspaceId(database, rawClerkOrganizationId);
  if (!workspaceId) return { notifications: [], unreadCount: 0 };

  const [notificationsResult, unreadResult] = await Promise.all([
    database.query(
      `
        select id, kind, title, body, task_id, call_id, read_at, created_at
        from app.notifications
        where workspace_id = $1
        order by created_at desc
        limit 30
      `,
      [workspaceId],
    ),
    database.query(
      `select count(*)::int as count from app.notifications where workspace_id = $1 and read_at is null`,
      [workspaceId],
    ),
  ]);

  return {
    notifications: notificationsResult.rows.map(serializeNotification),
    unreadCount: unreadResult.rows[0]?.count || 0,
  };
}

export async function markNotificationRead(database, raw = {}) {
  const workspaceId = await resolveNotificationWorkspaceId(database, raw.clerkOrganizationId);
  if (!workspaceId) throw new Error('workspace_not_provisioned');
  const notificationId = requiredText(raw.notificationId, 80, 'missing_notification_id');
  await database.query(
    `update app.notifications set read_at = now() where id = $1 and workspace_id = $2 and read_at is null`,
    [notificationId, workspaceId],
  );
  return listWorkspaceNotifications(database, raw.clerkOrganizationId);
}

export async function markAllNotificationsRead(database, rawClerkOrganizationId) {
  const workspaceId = await resolveNotificationWorkspaceId(database, rawClerkOrganizationId);
  if (!workspaceId) throw new Error('workspace_not_provisioned');
  await database.query(
    `update app.notifications set read_at = now() where workspace_id = $1 and read_at is null`,
    [workspaceId],
  );
  return listWorkspaceNotifications(database, rawClerkOrganizationId);
}
