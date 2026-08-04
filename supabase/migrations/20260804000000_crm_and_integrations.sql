-- Canonical Supabase baseline for the AutiveX operational CRM schema.
begin;

create schema if not exists app;

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, app
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create table if not exists app.workspaces (
  id uuid primary key default gen_random_uuid(),
  clerk_organization_id text not null unique,
  display_name text not null,
  timezone text not null default 'America/Mexico_City',
  locale text not null default 'es-MX',
  status text not null default 'testing',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint workspaces_clerk_org_format
    check (clerk_organization_id ~ '^org_[A-Za-z0-9_-]{3,128}$'),
  constraint workspaces_name_present
    check (length(btrim(display_name)) between 2 and 160),
  constraint workspaces_status
    check (status in ('testing', 'active', 'suspended', 'archived')),
  constraint workspaces_settings_object
    check (jsonb_typeof(settings) = 'object')
);

create table if not exists app.voice_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  provider text not null default 'retell',
  external_agent_id text not null,
  external_agent_version text,
  display_name text not null,
  environment text not null default 'demo',
  status text not null default 'testing',
  is_default boolean not null default false,
  assigned_phone_e164 text,
  fallback_phone_e164 text,
  approved_test_call_id text,
  webhook_verified boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint voice_agents_workspace_identity unique (workspace_id, id),
  constraint voice_agents_external_identity unique (provider, external_agent_id),
  constraint voice_agents_provider_format
    check (provider ~ '^[a-z][a-z0-9_]{1,49}$'),
  constraint voice_agents_environment
    check (environment in ('demo', 'staging', 'production')),
  constraint voice_agents_status
    check (status in ('draft', 'testing', 'active', 'paused', 'archived')),
  constraint voice_agents_assigned_phone
    check (assigned_phone_e164 is null or assigned_phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  constraint voice_agents_fallback_phone
    check (fallback_phone_e164 is null or fallback_phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  constraint voice_agents_distinct_phones
    check (
      assigned_phone_e164 is null
      or fallback_phone_e164 is null
      or assigned_phone_e164 <> fallback_phone_e164
    ),
  constraint voice_agents_settings_object
    check (jsonb_typeof(settings) = 'object')
);

create unique index if not exists voice_agents_one_default_per_environment
  on app.voice_agents (workspace_id, provider, environment)
  where is_default and archived_at is null;

create table if not exists app.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  display_name text,
  phone_e164 text,
  email text,
  stage text not null default 'new',
  source text not null default 'voice_call',
  do_not_contact boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint contacts_workspace_identity unique (workspace_id, id),
  constraint contacts_has_identity
    check (
      nullif(btrim(coalesce(display_name, '')), '') is not null
      or phone_e164 is not null
      or nullif(btrim(coalesce(email, '')), '') is not null
    ),
  constraint contacts_phone_format
    check (phone_e164 is null or phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  constraint contacts_stage
    check (stage in ('new', 'contacted', 'scheduled', 'closed')),
  constraint contacts_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists contacts_workspace_phone_unique
  on app.contacts (workspace_id, phone_e164)
  where phone_e164 is not null and archived_at is null;

create index if not exists contacts_workspace_email_idx
  on app.contacts (workspace_id, lower(email))
  where email is not null and archived_at is null;

create table if not exists app.calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  voice_agent_id uuid,
  contact_id uuid,
  provider text not null default 'retell',
  external_call_id text not null,
  channel text not null default 'web',
  direction text not null default 'inbound',
  status text not null default 'registered',
  from_phone_e164 text,
  to_phone_e164 text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  intent text,
  urgency text not null default 'unknown',
  disposition text,
  summary text,
  follow_up_required boolean not null default false,
  analysis jsonb not null default '{}'::jsonb,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calls_workspace_identity unique (workspace_id, id),
  constraint calls_external_identity unique (provider, external_call_id),
  constraint calls_voice_agent_tenant
    foreign key (workspace_id, voice_agent_id)
    references app.voice_agents(workspace_id, id),
  constraint calls_contact_tenant
    foreign key (workspace_id, contact_id)
    references app.contacts(workspace_id, id),
  constraint calls_channel
    check (channel in ('web', 'phone')),
  constraint calls_direction
    check (direction in ('inbound', 'outbound')),
  constraint calls_status
    check (status in ('registered', 'ongoing', 'ended', 'analyzed', 'error')),
  constraint calls_urgency
    check (urgency in ('unknown', 'normal', 'high', 'urgent')),
  constraint calls_duration
    check (duration_seconds is null or duration_seconds >= 0),
  constraint calls_time_order
    check (ended_at is null or started_at is null or ended_at >= started_at),
  constraint calls_analysis_object
    check (jsonb_typeof(analysis) = 'object'),
  constraint calls_metadata_object
    check (jsonb_typeof(provider_metadata) = 'object')
);

create index if not exists calls_workspace_started_idx
  on app.calls (workspace_id, started_at desc, id);

create index if not exists calls_workspace_contact_idx
  on app.calls (workspace_id, contact_id, started_at desc)
  where contact_id is not null;

create table if not exists app.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  contact_id uuid,
  call_id uuid,
  kind text not null default 'follow_up',
  title text not null,
  description text,
  priority text not null default 'normal',
  status text not null default 'open',
  dedupe_key text,
  due_at timestamptz,
  assigned_to_clerk_user_id text,
  completed_at timestamptz,
  completed_by_clerk_user_id text,
  created_by_clerk_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_contact_tenant
    foreign key (workspace_id, contact_id)
    references app.contacts(workspace_id, id),
  constraint tasks_call_tenant
    foreign key (workspace_id, call_id)
    references app.calls(workspace_id, id),
  constraint tasks_kind
    check (kind in ('follow_up', 'urgent_callback', 'review_call', 'appointment')),
  constraint tasks_priority
    check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint tasks_status
    check (status in ('open', 'in_progress', 'done', 'canceled')),
  constraint tasks_title_present
    check (length(btrim(title)) between 2 and 180),
  constraint tasks_completion_consistency
    check (
      (status in ('done', 'canceled') and completed_at is not null)
      or (status in ('open', 'in_progress') and completed_at is null)
    )
);

create unique index if not exists tasks_workspace_dedupe_unique
  on app.tasks (workspace_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists tasks_workspace_queue_idx
  on app.tasks (workspace_id, status, priority, due_at)
  where status in ('open', 'in_progress');

create table if not exists app.webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references app.workspaces(id) on delete cascade,
  call_id uuid,
  provider text not null,
  event_key text not null,
  event_type text not null,
  external_object_id text,
  status text not null default 'received',
  signature_verified_at timestamptz not null,
  payload_sha256 text,
  safe_payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  last_error_code text,
  next_retry_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint webhook_events_identity unique (provider, event_key),
  constraint webhook_events_call_tenant
    foreign key (workspace_id, call_id)
    references app.calls(workspace_id, id),
  constraint webhook_events_call_requires_workspace
    check (call_id is null or workspace_id is not null),
  constraint webhook_events_status
    check (status in ('received', 'processing', 'processed', 'ignored', 'failed', 'dead_letter')),
  constraint webhook_events_attempt_count
    check (attempt_count >= 0),
  constraint webhook_events_payload_hash
    check (payload_sha256 is null or payload_sha256 ~ '^[a-f0-9]{64}$'),
  constraint webhook_events_safe_payload_object
    check (jsonb_typeof(safe_payload) = 'object')
);

create index if not exists webhook_events_retry_idx
  on app.webhook_events (status, next_retry_at)
  where status = 'failed';

create index if not exists webhook_events_workspace_received_idx
  on app.webhook_events (workspace_id, received_at desc)
  where workspace_id is not null;

create table if not exists app.integration_providers (
  key text primary key,
  display_name text not null,
  category text not null,
  auth_strategy text not null,
  capabilities text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_providers_key_format
    check (key ~ '^[a-z][a-z0-9_]{1,49}$'),
  constraint integration_providers_category
    check (category in ('scheduling', 'messaging', 'crm', 'automation')),
  constraint integration_providers_auth_strategy
    check (auth_strategy in ('oauth2', 'embedded_signup', 'api_key', 'webhook', 'manual'))
);

insert into app.integration_providers
  (key, display_name, category, auth_strategy, capabilities)
values
  (
    'google_calendar',
    'Google Calendar',
    'scheduling',
    'oauth2',
    array['availability.read', 'appointments.read', 'appointments.write']
  ),
  (
    'calendly',
    'Calendly',
    'scheduling',
    'oauth2',
    array['availability.read', 'appointments.read']
  ),
  (
    'whatsapp_business',
    'WhatsApp Business',
    'messaging',
    'embedded_signup',
    array['messages.read', 'messages.write']
  ),
  (
    'custom_webhook',
    'Webhook personalizado',
    'automation',
    'webhook',
    array['events.write']
  )
on conflict (key) do update
set display_name = excluded.display_name,
    category = excluded.category,
    auth_strategy = excluded.auth_strategy,
    capabilities = excluded.capabilities,
    updated_at = now();

create table if not exists app.integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  provider_key text not null references app.integration_providers(key),
  connection_key text not null default 'primary',
  external_account_id text,
  external_tenant_id text,
  display_name text,
  status text not null default 'pending',
  is_primary boolean not null default false,
  scopes text[] not null default '{}',
  capabilities text[] not null default '{}',
  credential_ref text,
  config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by_clerk_user_id text not null,
  connected_by_clerk_user_id text,
  connected_at timestamptz,
  credential_expires_at timestamptz,
  last_verified_at timestamptz,
  last_sync_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  revoked_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_connections_workspace_key
    unique (workspace_id, provider_key, connection_key),
  constraint integration_connections_key_format
    check (connection_key ~ '^[a-z][a-z0-9_-]{1,49}$'),
  constraint integration_connections_status
    check (status in ('pending', 'connected', 'attention', 'error', 'revoked')),
  constraint integration_connections_connected_consistency
    check (
      status <> 'connected'
      or (
        external_account_id is not null
        and credential_ref is not null
        and connected_at is not null
      )
    ),
  constraint integration_connections_revoked_consistency
    check (revoked_at is null or status = 'revoked'),
  constraint integration_connections_config_object
    check (jsonb_typeof(config) = 'object'),
  constraint integration_connections_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists integration_connection_external_unique
  on app.integration_connections (workspace_id, provider_key, external_account_id)
  where external_account_id is not null and revoked_at is null and archived_at is null;

create unique index if not exists integration_connection_primary_unique
  on app.integration_connections (workspace_id, provider_key)
  where is_primary and revoked_at is null and archived_at is null;

create unique index if not exists integration_connection_credential_ref_unique
  on app.integration_connections (credential_ref)
  where credential_ref is not null;

create index if not exists integration_connections_workspace_idx
  on app.integration_connections (workspace_id, provider_key, status);

create table if not exists app.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  provider_key text not null references app.integration_providers(key),
  initiated_by_clerk_user_id text not null,
  state_digest text not null unique,
  pkce_verifier_ref text,
  return_path text not null default '/connections',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint integration_oauth_state_digest
    check (state_digest ~ '^[a-f0-9]{64}$'),
  constraint integration_oauth_return_path
    check (return_path like '/%' and return_path not like '//%'),
  constraint integration_oauth_expiry
    check (expires_at > created_at)
);

create index if not exists integration_oauth_cleanup_idx
  on app.integration_oauth_states (expires_at)
  where consumed_at is null;

create table if not exists app.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  actor_clerk_user_id text,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_log_action_present
    check (length(btrim(action)) between 2 and 120),
  constraint audit_log_target_present
    check (length(btrim(target_type)) between 2 and 80),
  constraint audit_log_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists audit_log_workspace_created_idx
  on app.audit_log (workspace_id, created_at desc);

drop trigger if exists workspaces_touch_updated_at on app.workspaces;
create trigger workspaces_touch_updated_at
before update on app.workspaces
for each row execute function app.touch_updated_at();

drop trigger if exists voice_agents_touch_updated_at on app.voice_agents;
create trigger voice_agents_touch_updated_at
before update on app.voice_agents
for each row execute function app.touch_updated_at();

drop trigger if exists contacts_touch_updated_at on app.contacts;
create trigger contacts_touch_updated_at
before update on app.contacts
for each row execute function app.touch_updated_at();

drop trigger if exists calls_touch_updated_at on app.calls;
create trigger calls_touch_updated_at
before update on app.calls
for each row execute function app.touch_updated_at();

drop trigger if exists tasks_touch_updated_at on app.tasks;
create trigger tasks_touch_updated_at
before update on app.tasks
for each row execute function app.touch_updated_at();

drop trigger if exists integration_providers_touch_updated_at on app.integration_providers;
create trigger integration_providers_touch_updated_at
before update on app.integration_providers
for each row execute function app.touch_updated_at();

drop trigger if exists integration_connections_touch_updated_at on app.integration_connections;
create trigger integration_connections_touch_updated_at
before update on app.integration_connections
for each row execute function app.touch_updated_at();

alter table app.workspaces enable row level security;
alter table app.voice_agents enable row level security;
alter table app.contacts enable row level security;
alter table app.calls enable row level security;
alter table app.tasks enable row level security;
alter table app.webhook_events enable row level security;
alter table app.integration_providers enable row level security;
alter table app.integration_connections enable row level security;
alter table app.integration_oauth_states enable row level security;
alter table app.audit_log enable row level security;

revoke all on schema app from public;
revoke all on all tables in schema app from public;
revoke all on all sequences in schema app from public;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on schema app from %I', role_name);
      execute format('revoke all on all tables in schema app from %I', role_name);
      execute format('revoke all on all sequences in schema app from %I', role_name);
    end if;
  end loop;
end;
$$;

commit;
