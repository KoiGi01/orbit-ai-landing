import {
  errorResponse,
  getWorkspace,
  saveProspectProfile,
} from '../lib/server/clerk-control.js';

function sendJson(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store');
  res.json(body);
}

export default async function handler(req, res) {
  if (!['GET', 'PUT'].includes(req.method)) {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    const authorization = req.headers.authorization;
    const workspace = req.method === 'GET'
      ? await getWorkspace(authorization)
      : await saveProspectProfile(authorization, req.body?.profile);
    sendJson(res, 200, { workspace });
  } catch (error) {
    const response = errorResponse(error);
    sendJson(res, response.status, response.body);
  }
}
