import { createHmac, timingSafeEqual } from 'node:crypto';
import { cleanText } from './lead-delivery.js';

function requiredText(value, max, errorCode) {
  const text = cleanText(value, max);
  if (!text) throw new Error(errorCode);
  return text;
}

function requiredIsoDate(value, errorCode) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) throw new Error(errorCode);
  return date.toISOString();
}

// Upserted by the signed n8n callback (see handleAppointmentsWebhookRequest
// below) right after it creates/cancels/edits an event during a call. This
// table only ever holds appointments the agent itself booked -- see the
// migration's header comment for why.
export async function upsertAgentAppointment(database, raw = {}) {
  const workspaceId = requiredText(raw.workspaceId, 80, 'missing_workspace_id');
  const externalEventId = requiredText(raw.externalEventId, 255, 'missing_external_event_id');
  const calendarId = requiredText(raw.calendarId, 255, 'missing_calendar_id');
  const startsAt = requiredIsoDate(raw.startsAt, 'invalid_starts_at');
  const endsAt = raw.endsAt ? requiredIsoDate(raw.endsAt, 'invalid_ends_at') : null;
  const summary = cleanText(raw.summary, 300) || null;
  const status = raw.status === 'cancelled' ? 'cancelled' : 'confirmed';
  const retellCallId = cleanText(raw.retellCallId, 128);

  return database.transaction(async (transaction) => {
    const workspaceResult = await transaction.query(
      `select id from app.workspaces where id = $1 and archived_at is null limit 1`,
      [workspaceId],
    );
    if (!workspaceResult.rows[0]) throw new Error('workspace_not_provisioned');

    let callId = null;
    if (retellCallId) {
      const callResult = await transaction.query(
        `select id from app.calls where workspace_id = $1 and provider = 'retell' and external_call_id = $2 limit 1`,
        [workspaceId, retellCallId],
      );
      callId = callResult.rows[0]?.id || null;
    }

    const result = await transaction.query(
      `
        insert into app.appointments (
          workspace_id, external_event_id, calendar_id, call_id, summary,
          starts_at, ends_at, status
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (workspace_id, external_event_id) do update
        set calendar_id = excluded.calendar_id,
            call_id = coalesce(excluded.call_id, app.appointments.call_id),
            summary = excluded.summary,
            starts_at = excluded.starts_at,
            ends_at = excluded.ends_at,
            status = excluded.status,
            updated_at = now()
        returning id, external_event_id, status
      `,
      [workspaceId, externalEventId, calendarId, callId, summary, startsAt, endsAt, status],
    );
    return result.rows[0];
  });
}

// Read side for the dashboard: which of the events in a date range did the
// agent actually book. The dashboard cross-references this against the full
// calendar (fetched live from n8n, see fetchCalendarEvents) by event id.
export async function listAgentBookedAppointments(database, workspaceId, raw = {}) {
  const from = raw.fromISO ? requiredIsoDate(raw.fromISO, 'invalid_from') : new Date(0).toISOString();
  const to = raw.toISO ? requiredIsoDate(raw.toISO, 'invalid_to') : new Date('9999-12-31').toISOString();
  const result = await database.query(
    `
      select external_event_id, summary, starts_at, ends_at, status
      from app.appointments
      where workspace_id = $1 and starts_at >= $2 and starts_at <= $3
      order by starts_at asc
    `,
    [workspaceId, from, to],
  );
  return result.rows.map((row) => ({
    externalEventId: row.external_event_id,
    summary: row.summary,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  }));
}

function appointmentsWebhookSecret(env) {
  const secret = String(env.AUTIVEX_APPOINTMENTS_WEBHOOK_SECRET || '').trim();
  if (!secret) throw new Error('missing_appointments_webhook_secret');
  return secret;
}

// Same HMAC-over-the-raw-body scheme this repo already uses outbound for
// notifyProvisioningStarted, just verified instead of signed: n8n is a
// trusted system we control on both ends, not a third party we can't
// influence like Retell, so no timestamp window is needed -- replays are
// harmless anyway since the write above is an idempotent upsert.
export function verifyAppointmentsWebhookSignature(rawBody, signatureHeader, secret) {
  const header = String(signatureHeader || '').trim();
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header);
  if (!match || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(match[1].toLowerCase(), 'hex');
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function handleAppointmentsWebhookRequest({ rawBody, signatureHeader, database, dependencies = {} }) {
  const env = dependencies.env || process.env;
  let secret;
  try {
    secret = appointmentsWebhookSecret(env);
  } catch {
    return { status: 503, body: { error: 'appointments_webhook_not_configured' } };
  }
  if (!verifyAppointmentsWebhookSignature(rawBody, signatureHeader, secret)) {
    return { status: 401, body: { error: 'invalid_signature' } };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'invalid_json_payload' } };
  }

  try {
    const appointment = await upsertAgentAppointment(database, payload);
    return { status: 200, body: { ok: true, appointmentId: appointment.id } };
  } catch (error) {
    const knownErrors = [
      'missing_workspace_id', 'missing_external_event_id', 'missing_calendar_id',
      'invalid_starts_at', 'invalid_ends_at', 'workspace_not_provisioned',
    ];
    if (knownErrors.includes(error?.message)) {
      return { status: 400, body: { error: error.message } };
    }
    console.error('Failed to record agent-booked appointment:', error?.message || error);
    return { status: 502, body: { error: 'appointment_sync_failed' } };
  }
}

// Reads the full calendar (both agent-booked and pre-existing events) by
// reusing the exact same n8n webhook the manage_calendar Retell tool already
// calls -- its "list" action needs nothing Retell-specific, so the dashboard
// can call it directly with a minimal { args: {...} } body. No changes to
// the n8n workflow are needed for this read path.
export async function fetchCalendarEvents(raw = {}, dependencies = {}) {
  const env = dependencies.env || process.env;
  const fetchImpl = dependencies.fetchImpl || fetch;
  const url = String(env.RETELL_CALENDAR_WEBHOOK_URL || '').trim();
  if (!/^https:\/\//.test(url)) throw new Error('missing_calendar_webhook_url');
  const calendarId = requiredText(raw.calendarId, 255, 'missing_calendar_id');
  const timeMin = raw.fromISO || new Date().toISOString();
  const timeMax = raw.toISO || new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args: { action: 'list', calendarId, timeMin, timeMax } }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`calendar_read_failed_${response.status}`);
  const body = await response.json().catch(() => null);
  const events = Array.isArray(body?.appointments) ? body.appointments : [];
  return events.map((event) => ({
    externalEventId: cleanText(event?.id, 255),
    summary: cleanText(event?.summary, 300),
    startsAt: event?.start?.dateTime || event?.start?.date || null,
    endsAt: event?.end?.dateTime || event?.end?.date || null,
  })).filter((event) => event.externalEventId && event.startsAt);
}
