import { errorResponse, getWorkspaceGoogleCalendarOptions } from '../../../lib/server/clerk-control.js';
import { createDatabase } from '../../../lib/server/database.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).setHeader('cache-control', 'no-store').json({ error: 'method_not_allowed' });
    return;
  }

  let database;
  try {
    database = createDatabase();
    const result = await getWorkspaceGoogleCalendarOptions(req.headers.authorization, database);
    res.status(200).setHeader('cache-control', 'no-store').json(result);
  } catch (error) {
    const response = errorResponse(error);
    res.status(response.status).setHeader('cache-control', 'no-store').json(response.body);
  } finally {
    if (database) await database.close();
  }
}
