-- Appointments the voice agent actually booked, so the dashboard can show a
-- real calendar instead of nothing. This table only ever holds agent-booked
-- events -- events that already existed on the business's Google Calendar
-- for other reasons are never written here. The dashboard tells the two
-- apart by fetching the full calendar (via the existing n8n manage_calendar
-- webhook) and checking each event's id against this table.
--
-- Upserted by a new signed callback n8n calls right after it successfully
-- creates/cancels/edits an event during a call -- see
-- lib/server/appointments.js for the endpoint that writes here.

create table if not exists app.appointments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  external_event_id text not null,
  calendar_id text not null,
  call_id uuid,
  contact_id uuid,
  summary text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_workspace_event_unique
    unique (workspace_id, external_event_id),
  constraint appointments_status
    check (status in ('confirmed', 'cancelled')),
  constraint appointments_call_tenant
    foreign key (workspace_id, call_id)
    references app.calls(workspace_id, id),
  constraint appointments_contact_tenant
    foreign key (workspace_id, contact_id)
    references app.contacts(workspace_id, id)
);

create index if not exists appointments_workspace_range_idx
  on app.appointments (workspace_id, starts_at);
