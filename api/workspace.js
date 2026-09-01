import {
  createWorkspaceTestCall,
  errorResponse,
  getWorkspace,
  getWorkspaceActivityForClient,
  getWorkspaceCalendar,
  getWorkspaceNotificationsForClient,
  getWorkspaceOutcomesForClient,
  getWorkspaceVoiceCatalog,
  markAllWorkspaceNotificationsReadForClient,
  markWorkspaceNotificationReadForClient,
  saveProspectProfile,
  saveWorkspaceAgentConfiguration,
  saveWorkspaceCalendarConnection,
  saveWorkspaceVoice,
} from '../lib/server/clerk-control.js';
import { createDatabase } from '../lib/server/database.js';

function sendJson(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store');
  res.json(body);
}

export default async function handler(req, res) {
  if (!['GET', 'PUT', 'POST', 'PATCH'].includes(req.method)) {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    const authorization = req.headers.authorization;
    if (req.method === 'GET' && req.query?.resource === 'voices') {
      sendJson(res, 200, await getWorkspaceVoiceCatalog(authorization));
      return;
    }
    if (req.method === 'GET' && req.query?.resource === 'activity') {
      const database = createDatabase();
      try {
        sendJson(res, 200, await getWorkspaceActivityForClient(authorization, database));
      } finally {
        await database.close();
      }
      return;
    }
    if (req.method === 'GET' && req.query?.resource === 'outcomes') {
      const database = createDatabase();
      try {
        sendJson(res, 200, await getWorkspaceOutcomesForClient(authorization, database, req.query?.days));
      } finally {
        await database.close();
      }
      return;
    }
    if (req.method === 'GET' && req.query?.resource === 'notifications') {
      const database = createDatabase();
      try {
        sendJson(res, 200, await getWorkspaceNotificationsForClient(authorization, database));
      } finally {
        await database.close();
      }
      return;
    }
    if (req.method === 'GET' && req.query?.resource === 'calendar') {
      const database = createDatabase();
      try {
        sendJson(res, 200, await getWorkspaceCalendar(authorization, database, {
          fromISO: req.query?.from,
          toISO: req.query?.to,
        }));
      } finally {
        await database.close();
      }
      return;
    }
    if (req.method === 'PATCH') {
      if (req.body?.action === 'update_agent_configuration') {
        sendJson(res, 200, await saveWorkspaceAgentConfiguration(authorization, req.body?.agent));
        return;
      }
      if (req.body?.action === 'save_calendar') {
        const database = createDatabase();
        try {
          sendJson(res, 200, await saveWorkspaceCalendarConnection(authorization, req.body?.calendar, database));
        } finally {
          await database.close();
        }
        return;
      }
      if (req.body?.action === 'mark_notification_read') {
        const database = createDatabase();
        try {
          sendJson(res, 200, await markWorkspaceNotificationReadForClient(authorization, database, req.body?.notificationId));
        } finally {
          await database.close();
        }
        return;
      }
      if (req.body?.action === 'mark_all_notifications_read') {
        const database = createDatabase();
        try {
          sendJson(res, 200, await markAllWorkspaceNotificationsReadForClient(authorization, database));
        } finally {
          await database.close();
        }
        return;
      }
      if (req.body?.action !== 'update_voice') {
        sendJson(res, 400, { error: 'invalid_workspace_action' });
        return;
      }
      sendJson(res, 200, await saveWorkspaceVoice(authorization, req.body, createDatabase()));
      return;
    }
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
