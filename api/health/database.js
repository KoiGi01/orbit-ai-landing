import { createDatabase } from '../../lib/server/database.js';
import { inspectDatabaseHealth } from '../../lib/server/database-health.js';

function sendJson(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store');
  res.json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  let database;
  try {
    database = createDatabase();
    sendJson(res, 200, await inspectDatabaseHealth(database));
  } catch (error) {
    console.error('AutiveX database health check failed:', error?.message || error);
    sendJson(res, 503, {
      ok: false,
      database: 'unavailable',
      schema: 'unknown',
    });
  } finally {
    await database?.close();
  }
}
