-- Client-facing notifications, v1: created only from real call activity
-- (a call_analyzed event that creates a follow-up task also creates one
-- notification referencing it), read/unread state, nothing fabricated.
--
-- task_id is intentionally NOT a foreign key: app.tasks has no
-- (workspace_id, id) unique/composite-PK constraint to reference (only a
-- global `id primary key`), and adding one now would mean altering an
-- already-deployed table. call_id can be tenant-scoped FK'd since
-- app.calls already has that composite unique.

create table if not exists app.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  kind text not null default 'task_created',
  title text not null,
  body text,
  task_id uuid,
  call_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_kind
    check (kind in ('task_created')),
  constraint notifications_title_present
    check (length(btrim(title)) between 2 and 180),
  constraint notifications_call_tenant
    foreign key (workspace_id, call_id)
    references app.calls(workspace_id, id)
);

create index if not exists notifications_workspace_unread_idx
  on app.notifications (workspace_id, read_at, created_at desc);
