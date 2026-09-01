-- Self-service Google Calendar OAuth. Credentials are encrypted by the
-- application before they reach Postgres; this schema only stores ciphertext
-- and opaque references. OAuth state is short-lived, one-time and bound to a
-- workspace/user so a callback cannot connect a different tenant.

update app.integration_providers
set auth_strategy = 'oauth2',
    capabilities = array['availability.read', 'appointments.read', 'appointments.write'],
    updated_at = now()
where key = 'google_calendar';

create table if not exists app.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  provider_key text not null references app.integration_providers(key),
  connection_key text not null default 'primary',
  encrypted_payload text not null,
  key_version integer not null default 1,
  account_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_credentials_workspace_key
    unique (workspace_id, provider_key, connection_key),
  constraint integration_credentials_connection_key_format
    check (connection_key ~ '^[a-z][a-z0-9_-]{1,49}$'),
  constraint integration_credentials_payload_present
    check (length(encrypted_payload) between 40 and 20000),
  constraint integration_credentials_key_version_positive
    check (key_version > 0)
);

create table if not exists app.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  provider_key text not null references app.integration_providers(key),
  initiated_by_clerk_user_id text not null,
  state_digest text not null unique,
  return_path text not null default '/app?section=connections',
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

drop trigger if exists integration_credentials_touch_updated_at on app.integration_credentials;
create trigger integration_credentials_touch_updated_at
before update on app.integration_credentials
for each row execute function app.touch_updated_at();

alter table app.integration_credentials enable row level security;
alter table app.integration_oauth_states enable row level security;

revoke all on app.integration_credentials from public;
revoke all on app.integration_oauth_states from public;
