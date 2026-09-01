import { completeWorkspaceGoogleCalendarOAuth, errorResponse } from '../../../lib/server/clerk-control.js';
import { createDatabase } from '../../../lib/server/database.js';
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  googleOAuthStateCookie,
  readCookieValue,
} from '../../../lib/server/google-calendar.js';

function appBaseUrl() {
  const configured = String(process.env.AUTIVEX_APP_URL || '').trim().replace(/\/$/, '');
  return /^https?:\/\//.test(configured) ? configured : 'http://127.0.0.1:4184';
}

function redirect(res, path) {
  res.status(302).setHeader('cache-control', 'no-store');
  res.setHeader('location', new URL(path, appBaseUrl()).toString());
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).setHeader('cache-control', 'no-store').json({ error: 'method_not_allowed' });
    return;
  }

  res.setHeader('set-cookie', googleOAuthStateCookie('', process.env, { clear: true }));
  if (req.query?.error) {
    redirect(res, '/app?section=connections&google_calendar=denied');
    return;
  }

  let database;
  try {
    database = createDatabase();
    const result = await completeWorkspaceGoogleCalendarOAuth(database, {
      state: Array.isArray(req.query?.state) ? req.query.state[0] : req.query?.state,
      code: Array.isArray(req.query?.code) ? req.query.code[0] : req.query?.code,
      cookieState: readCookieValue(req.headers.cookie, GOOGLE_OAUTH_STATE_COOKIE),
    });
    const separator = result.returnPath.includes('?') ? '&' : '?';
    redirect(res, `${result.returnPath}${separator}google_calendar=authorized`);
  } catch (error) {
    const response = errorResponse(error);
    redirect(res, `/app?section=connections&google_calendar=error&reason=${encodeURIComponent(response.body.error)}`);
  } finally {
    if (database) await database.close();
  }
}
