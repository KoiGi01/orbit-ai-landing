-- Demo data batches.
--
-- An operator can seed a Location with believable activity so a prospect sees
-- what their own dashboard looks like once it has volume, then remove it in one
-- click. Every seeded row carries the batch it came from; a real row leaves the
-- column null, which is what makes "remove demo data" safe: the delete is
-- always scoped to `demo_batch_id is not null` and can never reach production
-- activity.
--
-- Nullable and unconstrained on purpose -- no foreign key to a batches table,
-- because a batch has no attributes of its own. The identifier lives in the
-- Location's Clerk privateMetadata alongside when it was seeded and by whom.

begin;

alter table app.contacts add column if not exists demo_batch_id uuid;
alter table app.calls add column if not exists demo_batch_id uuid;
alter table app.tasks add column if not exists demo_batch_id uuid;
alter table app.appointments add column if not exists demo_batch_id uuid;
alter table app.notifications add column if not exists demo_batch_id uuid;

create index if not exists contacts_demo_batch_idx
  on app.contacts (workspace_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists calls_demo_batch_idx
  on app.calls (workspace_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists tasks_demo_batch_idx
  on app.tasks (workspace_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists appointments_demo_batch_idx
  on app.appointments (workspace_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists notifications_demo_batch_idx
  on app.notifications (workspace_id, demo_batch_id)
  where demo_batch_id is not null;

commit;
