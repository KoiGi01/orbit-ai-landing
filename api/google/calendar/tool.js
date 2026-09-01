import { createDatabase } from '../../../lib/server/database.js';
import { executeGoogleCalendarTool } from '../../../lib/server/google-calendar.js';
import { readRawBody, verifyRetellWebhookSignature } from '../../../lib/server/retell-webhook.js';

export const config = { api: { bodyParser: false } };

const CLIENT_ERRORS = new Set([
  'invalid_calendar_action', 'invalid_calendar_range', 'invalid_event_start',
  'invalid_event_end', 'invalid_event_range', 'invalid_attendee_email',
  'missing_event_summary', 'missing_event_id', 'missing_event_changes',
  'google_calendar_mismatch',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).setHeader('cache-control', 'no-store').json({ error: 'method_not_allowed' });
    return;
  }

  let database;
  try {
    const rawBody = await readRawBody(req);
    if (!verifyRetellWebhookSignature(rawBody, req.headers['x-retell-signature'], process.env.RETELL_API_KEY)) {
      res.status(401).setHeader('cache-control', 'no-store').json({ error: 'invalid_signature' });
      return;
    }
    let body;
    try { body = JSON.parse(rawBody); }
    catch {
      res.status(400).setHeader('cache-control', 'no-store').json({ error: 'invalid_json_payload' });
      return;
    }
    const queryWorkspaceId = Array.isArray(req.query?.workspaceId) ? req.query.workspaceId[0] : req.query?.workspaceId;
    const signedWorkspaceId = body?.args?.workspaceId || body?.workspaceId;
    if (!signedWorkspaceId || signedWorkspaceId !== queryWorkspaceId) {
      res.status(400).setHeader('cache-control', 'no-store').json({ error: 'google_calendar_workspace_mismatch' });
      return;
    }
    database = createDatabase();
    const result = await executeGoogleCalendarTool(
      database,
      queryWorkspaceId,
      body,
    );
    res.status(200).setHeader('cache-control', 'no-store').json(result);
  } catch (error) {
    const code = String(error?.message || 'calendar_tool_failed');
    const status = CLIENT_ERRORS.has(code) ? 400
      : ['google_calendar_authorization_required', 'google_calendar_not_selected', 'google_authorization_expired'].includes(code) ? 409
        : 502;
    if (status === 502) console.error('Google Calendar tool failed:', code);
    res.status(status).setHeader('cache-control', 'no-store').json({ error: code });
  } finally {
    if (database) await database.close();
  }
}
