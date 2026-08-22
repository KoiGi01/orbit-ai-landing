import { createDatabase } from '../../lib/server/database.js';
import { handleRetellWebhookRequest, readRawBody } from '../../lib/server/retell-webhook.js';

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

  let database;
  try {
    database = createDatabase();
    const rawBody = await readRawBody(req);
    const result = await handleRetellWebhookRequest({
      rawBody,
      signatureHeader: req.headers['x-retell-signature'],
      database,
      dependencies: {},
    });
    sendResult(res, result);
  } catch (error) {
    console.error('Retell webhook failed:', error?.message || error);
    res.status(502).setHeader('cache-control', 'no-store').json({ error: 'webhook_processing_failed' });
  } finally {
    if (database) await database.close();
  }
}
