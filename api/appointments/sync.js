import { handleAppointmentsWebhookRequest } from '../../lib/server/appointments.js';
import { createDatabase } from '../../lib/server/database.js';
import { readRawBody } from '../../lib/server/retell-webhook.js';

// Called by the n8n calendar workflow right after it creates/cancels/edits
// an event during a call -- signed the same way notifyProvisioningStarted
// signs its own outbound event, just verified here instead of sent.
export const config = { api: { bodyParser: false } };

function sendResult(res, result) {
  res.status(result.status).setHeader('cache-control', 'no-store');
  if (result.body === null) {
    res.end();
    return;
  }
  res.json(result.body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).setHeader('cache-control', 'no-store').json({ error: 'method_not_allowed' });
    return;
  }

  const database = createDatabase();
  try {
    const rawBody = await readRawBody(req);
    const result = await handleAppointmentsWebhookRequest({
      rawBody,
      signatureHeader: req.headers['x-autivex-signature'],
      database,
      dependencies: {},
    });
    sendResult(res, result);
  } catch (error) {
    console.error('Appointments sync webhook failed:', error?.message || error);
    res.status(502).setHeader('cache-control', 'no-store').json({ error: 'appointment_sync_failed' });
  } finally {
    await database.close();
  }
}
