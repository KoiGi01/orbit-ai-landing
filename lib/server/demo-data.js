import { randomUUID } from 'node:crypto';

/**
 * Demo activity for a Location.
 *
 * An operator seeds a prospect's workspace so the client sees their own
 * dashboard with volume instead of the empty state, then removes it when the
 * demo is over. Everything written here carries `demo_batch_id`; everything
 * real leaves it null, so removal is always scoped and can never delete
 * production activity.
 *
 * The dataset is derived, not random: the same Location seeded twice produces
 * the same shape, which keeps demos predictable and the tests stable. Content
 * follows the Location's own business profile when it has one, so the prospect
 * recognizes their services rather than a generic dental clinic.
 */

const ORGANIZATION_ID = /^org_[A-Za-z0-9_-]{3,128}$/;

const FALLBACK_SERVICES = [
  'Limpieza dental',
  'Ortodoncia',
  'Blanqueamiento',
  'Valoración inicial',
  'Urgencia dental',
];

const CONTACT_NAMES = [
  'María Rodríguez',
  'Jorge Luna',
  'Ana Cruz',
  'Patricia Gómez',
  'Ricardo Díaz',
  'Fernanda Ibarra',
  'Luis Ontiveros',
  'Claudia Mendoza',
  'Diego Salinas',
  'Ximena Ruiz',
  'Alejandro Peña',
  'Gabriela Torres',
  'Emilio Cabrera',
  'Renata Villalobos',
];

// Twelve calls inside the last 24 hours so the "Hoy" period reads as a busy
// day, then two per day going back three weeks for the 7 and 30 day periods.
const TODAY_CALLS = 12;
const HISTORY_DAYS = 20;
const CALLS_PER_HISTORY_DAY = 2;

const SUMMARY_TEMPLATES = [
  (service) => `Preguntó el costo de ${service} y pidió que le mandaran precios por WhatsApp.`,
  (service) => `Agendó ${service} y confirmó que llega 10 minutos antes.`,
  (service) => `Quiso mover su cita de ${service} a la semana entrante.`,
  (service) => `Preguntó horarios y ubicación antes de agendar ${service}.`,
  (service) => `Pidió información de ${service} para un familiar.`,
  (service) => `Llamó para confirmar que su cita de ${service} sigue en pie.`,
];

const FOLLOW_UP_SUMMARIES = [
  (service) => `Pidió una cotización detallada de ${service}; quedó de esperar la llamada del equipo.`,
  (service) => `Reportó una molestia fuerte y pidió que le regresaran la llamada hoy mismo para ${service}.`,
  (service) => `Preguntó por facilidades de pago para ${service}; requiere autorización del negocio.`,
  (service) => `Quedó en espera de disponibilidad para ${service} este fin de semana.`,
];

const TASK_BLUEPRINTS = [
  { kind: 'urgent_callback', priority: 'urgent', dueInHours: 2, title: (name) => `Devolver la llamada a ${name}`, description: (service) => `Pidió que le llamaran hoy por ${service}. Lucía no pudo resolverlo sola.` },
  { kind: 'urgent_callback', priority: 'high', dueInHours: 6, title: (name) => `Cotización pendiente para ${name}`, description: (service) => `Espera el precio cerrado de ${service} para decidir hoy.` },
  { kind: 'appointment', priority: 'high', dueInHours: 24, title: (name) => `Confirmar la cita de ${name}`, description: (service) => `Agendó ${service} pero pidió confirmación por teléfono.` },
  { kind: 'appointment', priority: 'normal', dueInHours: 30, title: (name) => `Reagendar a ${name}`, description: (service) => `Quiere mover su cita de ${service} a la semana entrante.` },
  { kind: 'follow_up', priority: 'normal', dueInHours: 48, title: (name) => `Dar seguimiento a ${name}`, description: (service) => `Preguntó por ${service} y quedó de pensarlo.` },
  { kind: 'review_call', priority: 'normal', dueInHours: 72, title: (name) => `Revisar la llamada de ${name}`, description: (service) => `La conversación sobre ${service} terminó sin un resultado claro.` },
];

const DEMO_CALENDAR_ID = 'demo@group.calendar.google.com';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function organizationId(value) {
  const id = String(value || '').trim();
  if (!ORGANIZATION_ID.test(id)) throw new Error('invalid_clerk_organization_id');
  return id;
}

// A stored service is `{ name, duration, price, details, color }` (see
// normalizeServiceEntry in clerk-control.js); older profiles kept plain
// strings. Reading `.name` matters: stringifying the object put a literal
// "[object Object]" into every seeded summary and task description.
function serviceName(service) {
  if (typeof service === 'string') return service.trim();
  if (service && typeof service === 'object') return String(service.name || '').trim();
  return '';
}

function serviceCatalog(profile) {
  const services = Array.isArray(profile?.services)
    ? profile.services.map(serviceName).filter(Boolean)
    : [];
  return services.length ? services.slice(0, 8) : FALLBACK_SERVICES;
}

function phoneForContact(index) {
  return `+52155${String(9000000 + index).slice(0, 7)}`;
}

function startOfToday(now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

async function resolveWorkspaceId(database, clerkOrganizationId) {
  const result = await database.query(
    'select id from app.workspaces where clerk_organization_id = $1 and archived_at is null limit 1',
    [clerkOrganizationId],
  );
  const workspace = result.rows[0];
  if (!workspace) throw new Error('workspace_not_provisioned');
  return workspace.id;
}

// Deletes children before parents: notifications and appointments point at
// calls, tasks point at both calls and contacts.
const CLEAR_ORDER = ['notifications', 'appointments', 'tasks', 'calls', 'contacts'];

async function deleteBatch(database, workspaceId) {
  const counts = {};
  for (const table of CLEAR_ORDER) {
    const result = await database.query(
      `delete from app.${table} where workspace_id = $1 and demo_batch_id is not null returning id`,
      [workspaceId],
    );
    counts[table] = result.rows.length;
  }
  return counts;
}

function buildContacts(catalog, now) {
  return CONTACT_NAMES.map((name, index) => ({
    id: randomUUID(),
    name,
    phone: phoneForContact(index),
    stage: index % 4 === 0 ? 'scheduled' : index % 3 === 0 ? 'contacted' : 'new',
    lastContactedAt: new Date(now.getTime() - (index + 1) * 9 * HOUR).toISOString(),
    service: catalog[index % catalog.length],
  }));
}

function buildCalls(contacts, catalog, now) {
  const midnight = startOfToday(now);
  const calls = [];

  for (let index = 0; index < TODAY_CALLS; index += 1) {
    calls.push({ startedAt: new Date(now.getTime() - (45 + index * 95) * 60 * 1000) });
  }

  for (let index = 0; index < HISTORY_DAYS * CALLS_PER_HISTORY_DAY; index += 1) {
    const dayOffset = 1 + Math.floor(index / CALLS_PER_HISTORY_DAY);
    const hour = index % CALLS_PER_HISTORY_DAY === 0 ? 10 : 17;
    const minute = (index * 13) % 60;
    calls.push({
      startedAt: new Date(midnight.getTime() - dayOffset * DAY + hour * HOUR + minute * 60 * 1000),
    });
  }

  return calls.map((call, index) => {
    const contact = contacts[(index * 5) % contacts.length];
    const service = catalog[index % catalog.length];
    // Four recent calls stay unresolved so "Necesitan atención" is not zero and
    // the decision queue has something real behind it.
    const followUp = index < 4;
    const durationSeconds = 45 + ((index * 37) % 375);
    return {
      id: randomUUID(),
      contactId: contact.id,
      externalCallId: `demo_${index}`,
      startedAt: call.startedAt,
      endedAt: new Date(call.startedAt.getTime() + durationSeconds * 1000),
      durationSeconds,
      followUp,
      urgency: index === 0 ? 'urgent' : followUp ? 'high' : 'normal',
      disposition: followUp ? 'follow_up' : index % 3 === 0 ? 'appointment_booked' : 'resolved',
      intent: service,
      summary: followUp
        ? FOLLOW_UP_SUMMARIES[index % FOLLOW_UP_SUMMARIES.length](service)
        : SUMMARY_TEMPLATES[index % SUMMARY_TEMPLATES.length](service),
      contactName: contact.name,
      service,
    };
  });
}

function buildTasks(calls, now) {
  return TASK_BLUEPRINTS.map((blueprint, index) => {
    const call = calls[index];
    return {
      id: randomUUID(),
      callId: call.id,
      contactId: call.contactId,
      kind: blueprint.kind,
      priority: blueprint.priority,
      title: blueprint.title(call.contactName),
      description: blueprint.description(call.service),
      dueAt: new Date(now.getTime() + blueprint.dueInHours * HOUR),
    };
  });
}

function buildAppointments(contacts, calls, catalog, now) {
  const midnight = startOfToday(now);
  const slots = [
    { dayOffset: 0, hour: 16, status: 'confirmed' },
    { dayOffset: 1, hour: 10, status: 'confirmed' },
    { dayOffset: 1, hour: 13, status: 'confirmed' },
    { dayOffset: 2, hour: 11, status: 'confirmed' },
    { dayOffset: 3, hour: 17, status: 'cancelled' },
    { dayOffset: -1, hour: 12, status: 'confirmed' },
    { dayOffset: -2, hour: 9, status: 'confirmed' },
    { dayOffset: -4, hour: 15, status: 'confirmed' },
  ];

  return slots.map((slot, index) => {
    const contact = contacts[(index * 3) % contacts.length];
    const service = catalog[index % catalog.length];
    const startsAt = new Date(midnight.getTime() + slot.dayOffset * DAY + slot.hour * HOUR);
    return {
      id: randomUUID(),
      externalEventId: `demo_${index}`,
      contactId: contact.id,
      callId: calls[index % calls.length].id,
      summary: `${service} · ${contact.name}`,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 45 * 60 * 1000),
      status: slot.status,
    };
  });
}

function buildNotifications(tasks, calls) {
  return tasks.slice(0, 4).map((task) => ({
    id: randomUUID(),
    taskId: task.id,
    callId: task.callId,
    title: task.title.slice(0, 180),
    body: task.description,
  }));
}

export async function populateDemoData(database, raw = {}) {
  const clerkOrganizationId = organizationId(raw.clerkOrganizationId);
  const workspaceId = await resolveWorkspaceId(database, clerkOrganizationId);
  const now = raw.now instanceof Date ? raw.now : new Date();
  const batchId = randomUUID();
  const catalog = serviceCatalog(raw.profile);

  const contacts = buildContacts(catalog, now);
  const calls = buildCalls(contacts, catalog, now);
  const tasks = buildTasks(calls, now);
  const appointments = buildAppointments(contacts, calls, catalog, now);
  const notifications = buildNotifications(tasks, calls);

  await database.transaction(async (transaction) => {
    // Seeding replaces the previous batch rather than stacking on it, so an
    // operator can re-run this after editing the Location's profile.
    await deleteBatch(transaction, workspaceId);

    for (const contact of contacts) {
      await transaction.query(
        `
          insert into app.contacts (id, workspace_id, display_name, phone_e164, stage, source, last_contacted_at, demo_batch_id)
          values ($1, $2, $3, $4, $5, 'voice_call', $6, $7)
        `,
        [contact.id, workspaceId, contact.name, contact.phone, contact.stage, contact.lastContactedAt, batchId],
      );
    }

    for (const call of calls) {
      await transaction.query(
        `
          insert into app.calls (
            id, workspace_id, contact_id, external_call_id, channel, direction, status,
            from_phone_e164, started_at, ended_at, duration_seconds,
            intent, urgency, disposition, summary, follow_up_required, demo_batch_id
          ) values (
            $1, $2, $3, $4, 'phone', 'inbound', 'analyzed',
            $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14
          )
        `,
        [
          call.id,
          workspaceId,
          call.contactId,
          `${call.externalCallId}_${batchId}`,
          contacts.find((contact) => contact.id === call.contactId).phone,
          call.startedAt.toISOString(),
          call.endedAt.toISOString(),
          call.durationSeconds,
          call.intent,
          call.urgency,
          call.disposition,
          call.summary,
          call.followUp,
          batchId,
        ],
      );
    }

    for (const task of tasks) {
      await transaction.query(
        `
          insert into app.tasks (
            id, workspace_id, contact_id, call_id, kind, title, description,
            priority, status, dedupe_key, due_at, demo_batch_id
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, $11)
        `,
        [
          task.id,
          workspaceId,
          task.contactId,
          task.callId,
          task.kind,
          task.title,
          task.description,
          task.priority,
          `demo:${batchId}:${task.kind}:${task.id}`,
          task.dueAt.toISOString(),
          batchId,
        ],
      );
    }

    for (const appointment of appointments) {
      await transaction.query(
        `
          insert into app.appointments (
            id, workspace_id, external_event_id, calendar_id, call_id, contact_id,
            summary, starts_at, ends_at, status, demo_batch_id
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          appointment.id,
          workspaceId,
          `${appointment.externalEventId}_${batchId}`,
          DEMO_CALENDAR_ID,
          appointment.callId,
          appointment.contactId,
          appointment.summary,
          appointment.startsAt.toISOString(),
          appointment.endsAt.toISOString(),
          appointment.status,
          batchId,
        ],
      );
    }

    for (const notification of notifications) {
      await transaction.query(
        `
          insert into app.notifications (id, workspace_id, kind, title, body, task_id, call_id, demo_batch_id)
          values ($1, $2, 'task_created', $3, $4, $5, $6, $7)
        `,
        [
          notification.id,
          workspaceId,
          notification.title,
          notification.body,
          notification.taskId,
          notification.callId,
          batchId,
        ],
      );
    }
  });

  return {
    batchId,
    workspaceId,
    seededAt: now.toISOString(),
    counts: {
      contacts: contacts.length,
      calls: calls.length,
      tasks: tasks.length,
      appointments: appointments.length,
      notifications: notifications.length,
    },
  };
}

export async function clearDemoData(database, raw = {}) {
  const clerkOrganizationId = organizationId(raw.clerkOrganizationId);
  const workspaceId = await resolveWorkspaceId(database, clerkOrganizationId);
  const counts = await database.transaction((transaction) => deleteBatch(transaction, workspaceId));
  return { workspaceId, counts };
}

export async function getDemoDataStatus(database, raw = {}) {
  const clerkOrganizationId = organizationId(raw.clerkOrganizationId);
  const workspaceId = await resolveWorkspaceId(database, clerkOrganizationId);
  const result = await database.query(
    `
      select
        count(*) filter (where demo_batch_id is not null)::int as demo_calls,
        count(*) filter (where demo_batch_id is null)::int as real_calls
      from app.calls
      where workspace_id = $1
    `,
    [workspaceId],
  );
  const row = result.rows[0] || {};
  return {
    workspaceId,
    demoCalls: Number(row.demo_calls || 0),
    realCalls: Number(row.real_calls || 0),
  };
}
