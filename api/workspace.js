import {
  createWorkspaceTestCall,
  errorResponse,
  getWorkspace,
  saveProspectProfile,
} from '../lib/server/clerk-control.js';
import { createDatabase } from '../lib/server/database.js';

function sendJson(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store');
  res.json(body);
}

export default async function handler(req, res) {
  if (!['GET', 'PUT', 'POST'].includes(req.method)) {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    const authorization = req.headers.authorization;
    if (req.method === 'POST') {
      if (req.body?.action !== 'create_test_call') {
        sendJson(res, 400, { error: 'invalid_workspace_action' });
        return;
      }
      const call = await createWorkspaceTestCall(authorization, req.body, createDatabase());
      sendJson(res, 200, call);
      return;
    }
    const workspace = req.method === 'GET'
      ? await getWorkspace(authorization)
      : await saveProspectProfile(authorization, req.body?.profile);
    sendJson(res, 200, { workspace });
  } catch (error) {
    const response = errorResponse(error);
    sendJson(res, response.status, response.body);
  }
}
