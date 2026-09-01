import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { cleanText } from './lead-delivery.js';
import { upsertAgentAppointment } from './appointments.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const OAUTH_TTL_MS = 10 * 60 * 1000;

export const GOOGLE_OAUTH_STATE_COOKIE = 'autivex_google_oauth_state';
export const GOOGLE_CALENDAR_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
]);

function requiredText(value, max, code) {
  const text = cleanText(value, max);
  if (!text) throw new Error(code);
  return text;
}

function workspaceId(value) {
  const id = requiredText(value, 80, 'missing_workspace_id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('invalid_workspace_id');
  }
  return id;
}

function safeReturnPath(value) {
  const path = String(value || '/app?section=connections').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.length > 300) return '/app?section=connections';
  return path;
}

function oauthConfig(env = process.env) {
  const clientId = String(env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const appUrl = String(env.AUTIVEX_APP_URL || '').trim().replace(/\/$/, '');
  if (!clientId || !clientSecret) throw new Error('google_oauth_not_configured');
  if (!/^https:\/\//.test(appUrl) && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(appUrl)) {
    throw new Error('google_oauth_app_url_invalid');
  }
  const redirectUri = String(env.GOOGLE_OAUTH_REDIRECT_URI || `${appUrl}/api/google/calendar/callback`).trim();
  try {
    const redirect = new URL(redirectUri);
    if (!['https:', 'http:'].includes(redirect.protocol)) throw new Error('invalid');
  } catch {
    throw new Error('google_oauth_redirect_uri_invalid');
  }
  return { clientId, clientSecret, appUrl, redirectUri };
}

function encryptionKey(env = process.env) {
  const raw = String(env.AUTIVEX_CREDENTIAL_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('credential_encryption_not_configured');
  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (key.length !== 32) throw new Error('credential_encryption_key_invalid');
  return key;
}

function credentialAad(rawWorkspaceId) {
  return Buffer.from(`autivex:google-calendar:${rawWorkspaceId}`, 'utf8');
}

export function encryptGoogleCredential(payload, rawWorkspaceId, env = process.env) {
  const id = workspaceId(rawWorkspaceId);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  cipher.setAAD(credentialAad(id));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptGoogleCredential(encrypted, rawWorkspaceId, env = process.env) {
  const id = workspaceId(rawWorkspaceId);
  const [version, ivText, tagText, ciphertextText, ...rest] = String(encrypted || '').split('.');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText || rest.length) {
    throw new Error('google_credential_invalid');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(env), Buffer.from(ivText, 'base64url'));
    decipher.setAAD(credentialAad(id));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const payload = JSON.parse(plaintext);
    if (!payload?.refreshToken) throw new Error('missing refresh token');
    return payload;
  } catch (error) {
    if (error?.message === 'credential_encryption_not_configured' || error?.message === 'credential_encryption_key_invalid') throw error;
    throw new Error('google_credential_invalid');
  }
}

function stateDigest(state) {
  return createHash('sha256').update(String(state || '')).digest('hex');
}

export function googleOAuthStateCookie(state, env = process.env, { clear = false } = {}) {
  const parts = [
    `${GOOGLE_OAUTH_STATE_COOKIE}=${clear ? '' : encodeURIComponent(state)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    clear ? 'Max-Age=0' : `Max-Age=${Math.floor(OAUTH_TTL_MS / 1000)}`,
  ];
  const domain = String(env.GOOGLE_OAUTH_COOKIE_DOMAIN || '').trim();
  if (domain && /^\.?[a-z0-9.-]+$/i.test(domain)) parts.push(`Domain=${domain}`);
  const appUrl = String(env.AUTIVEX_APP_URL || '');
  if (appUrl.startsWith('https://')) parts.push('Secure');
  return parts.join('; ');
}

export function readCookieValue(cookieHeader, name) {
  const entry = String(cookieHeader || '').split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!entry) return '';
  try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return ''; }
}

function equalState(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && leftBuffer.length > 0 && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function beginGoogleCalendarOAuth(database, raw = {}, dependencies = {}) {
  const env = dependencies.env || process.env;
  const config = oauthConfig(env);
  const id = workspaceId(raw.workspaceId);
  const userId = requiredText(raw.clerkUserId, 100, 'missing_clerk_user_id');
  const state = randomBytes(32).toString('base64url');
  const returnPath = safeReturnPath(raw.returnPath);

  await database.query(
    `
      insert into app.integration_oauth_states (
        id, workspace_id, provider_key, initiated_by_clerk_user_id,
        state_digest, return_path, expires_at
      ) values ($1, $2, 'google_calendar', $3, $4, $5, $6)
    `,
    [randomUUID(), id, userId, stateDigest(state), returnPath, new Date(Date.now() + OAUTH_TTL_MS).toISOString()],
  );

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES.join(' '));
  url.searchParams.set('state', state);

  return {
    authorizationUrl: url.toString(),
    stateCookie: googleOAuthStateCookie(state, env),
  };
}

async function googleTokenRequest(parameters, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(parameters),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error === 'invalid_grant' ? 'google_authorization_expired' : 'google_token_exchange_failed');
    error.status = response.status;
    throw error;
  }
  return body;
}

async function googleRequest(accessToken, path, options = {}, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const response = await fetchImpl(`${GOOGLE_CALENDAR_API}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    signal: options.signal || AbortSignal.timeout(10_000),
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(response.status === 401 ? 'google_authorization_expired' : 'google_calendar_request_failed');
    error.status = response.status;
    error.googleReason = cleanText(body?.error?.message, 240);
    throw error;
  }
  return body;
}

async function listCalendarEntries(accessToken, dependencies = {}) {
  const calendars = [];
  let pageToken = '';
  for (let page = 0; page < 4; page += 1) {
    const params = new URLSearchParams({ minAccessRole: 'writer', maxResults: '250', showDeleted: 'false' });
    if (pageToken) params.set('pageToken', pageToken);
    const body = await googleRequest(accessToken, `/users/me/calendarList?${params}`, {}, dependencies);
    calendars.push(...(Array.isArray(body?.items) ? body.items : []));
    pageToken = String(body?.nextPageToken || '');
    if (!pageToken) break;
  }
  return calendars;
}

function serializeCalendar(calendar) {
  return {
    id: cleanText(calendar?.id, 255),
    name: cleanText(calendar?.summaryOverride || calendar?.summary || calendar?.id, 160),
    description: cleanText(calendar?.description, 240) || null,
    timeZone: cleanText(calendar?.timeZone, 80) || null,
    accessRole: cleanText(calendar?.accessRole, 40),
    primary: calendar?.primary === true,
    backgroundColor: /^#[0-9a-f]{6}$/i.test(String(calendar?.backgroundColor || '')) ? calendar.backgroundColor : null,
  };
}

export async function completeGoogleCalendarOAuth(database, raw = {}, dependencies = {}) {
  const env = dependencies.env || process.env;
  const config = oauthConfig(env);
  const state = requiredText(raw.state, 160, 'google_oauth_state_missing');
  const code = requiredText(raw.code, 2048, 'google_oauth_code_missing');
  if (!equalState(state, raw.cookieState)) throw new Error('google_oauth_state_invalid');

  const stateResult = await database.query(
    `
      update app.integration_oauth_states oauth
      set consumed_at = now()
      from app.workspaces workspace
      where oauth.workspace_id = workspace.id
        and oauth.provider_key = 'google_calendar'
        and oauth.state_digest = $1
        and oauth.consumed_at is null
        and oauth.expires_at > now()
      returning oauth.id, oauth.workspace_id, oauth.initiated_by_clerk_user_id,
        oauth.return_path, workspace.clerk_organization_id
    `,
    [stateDigest(state)],
  );
  const oauthState = stateResult.rows[0];
  if (!oauthState) throw new Error('google_oauth_state_invalid');

  const token = await googleTokenRequest({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  }, dependencies);
  if (!token.refresh_token) throw new Error('google_refresh_token_missing');

  const grantedScopes = String(token.scope || '').split(/\s+/).filter(Boolean);
  const missingScope = GOOGLE_CALENDAR_SCOPES.find((scope) => !grantedScopes.includes(scope));
  if (missingScope) throw new Error('google_calendar_permission_missing');

  const entries = await listCalendarEntries(token.access_token, dependencies);
  const primary = entries.find((calendar) => calendar.primary) || entries[0] || null;
  const accountLabel = cleanText(primary?.id, 254) || 'Cuenta de Google';
  const encryptedPayload = encryptGoogleCredential({
    refreshToken: token.refresh_token,
    scopes: grantedScopes,
    connectedAt: new Date().toISOString(),
  }, oauthState.workspace_id, env);

  await database.transaction(async (transaction) => {
    const credentialResult = await transaction.query(
      `
        insert into app.integration_credentials (
          id, workspace_id, provider_key, connection_key,
          encrypted_payload, key_version, account_label
        ) values ($1, $2, 'google_calendar', 'primary', $3, 1, $4)
        on conflict (workspace_id, provider_key, connection_key) do update
        set encrypted_payload = excluded.encrypted_payload,
            key_version = excluded.key_version,
            account_label = excluded.account_label,
            updated_at = now()
        returning id
      `,
      [randomUUID(), oauthState.workspace_id, encryptedPayload, accountLabel],
    );
    const credentialId = credentialResult.rows[0].id;
    await transaction.query(
      `
        insert into app.integration_connections (
          id, workspace_id, provider_key, connection_key, display_name,
          status, is_primary, scopes, capabilities, credential_ref,
          metadata, created_by_clerk_user_id, connected_by_clerk_user_id
        ) values (
          $1, $2, 'google_calendar', 'primary', 'Google Calendar',
          'pending', false, string_to_array($3, ','),
          array['availability.read', 'appointments.read', 'appointments.write'],
          $4, $5::text::jsonb, $6, $6
        )
        on conflict (workspace_id, provider_key, connection_key) do update
        set external_account_id = null,
            display_name = 'Google Calendar',
            status = 'pending',
            is_primary = false,
            scopes = excluded.scopes,
            capabilities = excluded.capabilities,
            credential_ref = excluded.credential_ref,
            metadata = excluded.metadata,
            connected_by_clerk_user_id = excluded.connected_by_clerk_user_id,
            connected_at = null,
            revoked_at = null,
            last_error_code = null,
            last_error_at = null,
            updated_at = now()
      `,
      [
        randomUUID(),
        oauthState.workspace_id,
        grantedScopes.join(','),
        `db:integration_credentials:${credentialId}`,
        JSON.stringify({ accountLabel, oauthConnectedAt: new Date().toISOString() }),
        oauthState.initiated_by_clerk_user_id,
      ],
    );
  });

  return {
    workspaceId: oauthState.workspace_id,
    clerkOrganizationId: oauthState.clerk_organization_id,
    returnPath: safeReturnPath(oauthState.return_path),
    accountLabel,
    calendarCount: entries.length,
  };
}

async function loadGoogleCredential(database, rawWorkspaceId, env = process.env) {
  const id = workspaceId(rawWorkspaceId);
  const result = await database.query(
    `
      select connection.external_account_id, connection.display_name,
        connection.status, connection.credential_ref, credential.id as credential_id,
        credential.encrypted_payload, credential.account_label
      from app.integration_connections connection
      join app.integration_credentials credential
        on credential.workspace_id = connection.workspace_id
        and credential.provider_key = connection.provider_key
        and credential.connection_key = connection.connection_key
      where connection.workspace_id = $1
        and connection.provider_key = 'google_calendar'
        and connection.connection_key = 'primary'
        and connection.archived_at is null
      limit 1
    `,
    [id],
  );
  const connection = result.rows[0];
  if (!connection || !String(connection.credential_ref || '').startsWith('db:integration_credentials:')) {
    throw new Error('google_calendar_authorization_required');
  }
  return {
    ...connection,
    workspaceId: id,
    credential: decryptGoogleCredential(connection.encrypted_payload, id, env),
  };
}

async function accessTokenForWorkspace(database, rawWorkspaceId, dependencies = {}) {
  const env = dependencies.env || process.env;
  const config = oauthConfig(env);
  const connection = await loadGoogleCredential(database, rawWorkspaceId, env);
  const token = await googleTokenRequest({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: connection.credential.refreshToken,
    grant_type: 'refresh_token',
  }, dependencies);
  return { accessToken: token.access_token, connection };
}

export async function listWritableGoogleCalendars(database, rawWorkspaceId, dependencies = {}) {
  try {
    const { accessToken, connection } = await accessTokenForWorkspace(database, rawWorkspaceId, dependencies);
    const entries = await listCalendarEntries(accessToken, dependencies);
    return {
      oauthConnected: true,
      accountLabel: connection.account_label || 'Cuenta de Google',
      selectedCalendarId: connection.status === 'connected' ? connection.external_account_id : null,
      calendars: entries.map(serializeCalendar).filter((calendar) => calendar.id),
    };
  } catch (error) {
    if (error?.message === 'google_calendar_authorization_required') {
      return { oauthConnected: false, accountLabel: null, selectedCalendarId: null, calendars: [] };
    }
    if (error?.message === 'google_authorization_expired') {
      await database.query(
        `
          update app.integration_connections
          set status = 'attention', last_error_code = 'google_authorization_expired',
              last_error_at = now(), updated_at = now()
          where workspace_id = $1 and provider_key = 'google_calendar' and connection_key = 'primary'
        `,
        [workspaceId(rawWorkspaceId)],
      ).catch(() => {});
    }
    throw error;
  }
}

export async function selectGoogleCalendar(database, rawWorkspaceId, raw = {}, dependencies = {}) {
  const id = workspaceId(rawWorkspaceId);
  const calendarId = requiredText(raw.calendarId, 255, 'missing_calendar_id');
  const options = await listWritableGoogleCalendars(database, id, dependencies);
  const calendar = options.calendars.find((item) => item.id === calendarId);
  if (!calendar) throw new Error('google_calendar_not_writable');

  const result = await database.query(
    `
      update app.integration_connections
      set external_account_id = $2,
          display_name = $3,
          status = 'connected',
          is_primary = true,
          config = $4::text::jsonb,
          connected_at = coalesce(connected_at, now()),
          last_verified_at = now(),
          last_error_code = null,
          last_error_at = null,
          revoked_at = null,
          updated_at = now()
      where workspace_id = $1
        and provider_key = 'google_calendar'
        and connection_key = 'primary'
      returning id, external_account_id, display_name, status, connected_at
    `,
    [id, calendar.id, calendar.name, JSON.stringify({ timeZone: calendar.timeZone, accessRole: calendar.accessRole, primary: calendar.primary })],
  );
  if (!result.rows[0]) throw new Error('google_calendar_authorization_required');
  return { ...calendar, connectedAt: result.rows[0].connected_at };
}

function normalizedRange(raw = {}) {
  const from = new Date(String(raw.fromISO || raw.timeMin || new Date().toISOString()));
  const to = new Date(String(raw.toISO || raw.timeMax || new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString()));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw new Error('invalid_calendar_range');
  return { timeMin: from.toISOString(), timeMax: to.toISOString() };
}

function serializeEvent(event) {
  return {
    externalEventId: cleanText(event?.id, 255),
    summary: cleanText(event?.summary, 300),
    description: cleanText(event?.description, 1000) || null,
    startsAt: event?.start?.dateTime || event?.start?.date || null,
    endsAt: event?.end?.dateTime || event?.end?.date || null,
    status: cleanText(event?.status, 40) || null,
    htmlLink: /^https:\/\//.test(String(event?.htmlLink || '')) ? event.htmlLink : null,
  };
}

async function listEvents(accessToken, calendarId, raw = {}, dependencies = {}) {
  const range = normalizedRange(raw);
  const params = new URLSearchParams({
    timeMin: range.timeMin,
    timeMax: range.timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const body = await googleRequest(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {}, dependencies);
  return (Array.isArray(body?.items) ? body.items : []).map(serializeEvent)
    .filter((event) => event.externalEventId && event.startsAt && event.status !== 'cancelled');
}

export async function fetchGoogleCalendarEvents(database, rawWorkspaceId, raw = {}, dependencies = {}) {
  const { accessToken, connection } = await accessTokenForWorkspace(database, rawWorkspaceId, dependencies);
  if (connection.status !== 'connected' || !connection.external_account_id) throw new Error('google_calendar_not_selected');
  return listEvents(accessToken, connection.external_account_id, raw, dependencies);
}

function isoDate(value, code) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) throw new Error(code);
  return date.toISOString();
}

function attendeeEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalid_attendee_email');
  return email;
}

function eventPath(calendarId, eventId = '') {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

function deterministicGoogleEventId(workspace, callId, args) {
  if (!callId) return undefined;
  return `a${createHash('sha256').update(JSON.stringify({ workspace, callId, start: args.start, end: args.end, summary: args.summary, attendee: args.attendee })).digest('hex')}`;
}

async function getEvent(accessToken, calendarId, eventId, dependencies) {
  return googleRequest(accessToken, eventPath(calendarId, eventId), {}, dependencies);
}

export async function executeGoogleCalendarTool(database, rawWorkspaceId, raw = {}, dependencies = {}) {
  const id = workspaceId(rawWorkspaceId);
  const args = raw.args && typeof raw.args === 'object' ? raw.args : raw;
  const action = cleanText(args.action, 20);
  const callId = cleanText(raw.call?.call_id || raw.callId, 128);
  const { accessToken, connection } = await accessTokenForWorkspace(database, id, dependencies);
  const calendarId = connection.external_account_id;
  if (connection.status !== 'connected' || !calendarId) throw new Error('google_calendar_not_selected');
  if (args.calendarId && String(args.calendarId) !== calendarId) throw new Error('google_calendar_mismatch');

  if (action === 'list') {
    const events = await listEvents(accessToken, calendarId, args, dependencies);
    return {
      success: true,
      action,
      appointments: events.map((event) => ({
        id: event.externalEventId,
        summary: event.summary,
        start: { dateTime: event.startsAt },
        end: { dateTime: event.endsAt },
      })),
    };
  }

  if (action === 'create') {
    const start = isoDate(args.start, 'invalid_event_start');
    const end = isoDate(args.end, 'invalid_event_end');
    if (new Date(end) <= new Date(start)) throw new Error('invalid_event_range');
    const summary = requiredText(args.summary, 300, 'missing_event_summary');
    const attendee = attendeeEmail(args.attendee);
    const eventBody = {
      ...(deterministicGoogleEventId(id, callId, { ...args, start, end, summary, attendee }) ? { id: deterministicGoogleEventId(id, callId, { ...args, start, end, summary, attendee }) } : {}),
      summary,
      ...(cleanText(args.description, 1000) ? { description: cleanText(args.description, 1000) } : {}),
      start: { dateTime: start },
      end: { dateTime: end },
      ...(attendee ? { attendees: [{ email: attendee }] } : {}),
    };
    const params = new URLSearchParams({ sendUpdates: attendee ? 'all' : 'none' });
    let event;
    try {
      event = await googleRequest(accessToken, `${eventPath(calendarId)}?${params}`, {
        method: 'POST',
        body: JSON.stringify(eventBody),
      }, dependencies);
    } catch (error) {
      if (error.status !== 409 || !eventBody.id) throw error;
      event = await getEvent(accessToken, calendarId, eventBody.id, dependencies);
    }
    const serialized = serializeEvent(event);
    await upsertAgentAppointment(database, {
      workspaceId: id,
      externalEventId: serialized.externalEventId,
      calendarId,
      retellCallId: callId,
      summary: serialized.summary,
      startsAt: serialized.startsAt,
      endsAt: serialized.endsAt,
    });
    return { success: true, action, event: serialized };
  }

  const eventId = requiredText(args.eventId, 255, 'missing_event_id');
  if (action === 'cancel') {
    let existing = null;
    try { existing = await getEvent(accessToken, calendarId, eventId, dependencies); }
    catch (error) { if (![404, 410].includes(error.status)) throw error; }
    if (existing) {
      const params = new URLSearchParams({ sendUpdates: 'all' });
      await googleRequest(accessToken, `${eventPath(calendarId, eventId)}?${params}`, { method: 'DELETE' }, dependencies);
      const serialized = serializeEvent(existing);
      await upsertAgentAppointment(database, {
        workspaceId: id,
        externalEventId: eventId,
        calendarId,
        retellCallId: callId,
        summary: serialized.summary,
        startsAt: serialized.startsAt,
        endsAt: serialized.endsAt,
        status: 'cancelled',
      });
    }
    return { success: true, action, eventId, alreadyCancelled: !existing };
  }

  if (action === 'edit') {
    const patch = {};
    if (args.summary) patch.summary = requiredText(args.summary, 300, 'missing_event_summary');
    if (args.description !== undefined) patch.description = cleanText(args.description, 1000);
    if (args.start || args.end) {
      const start = isoDate(args.start, 'invalid_event_start');
      const end = isoDate(args.end, 'invalid_event_end');
      if (new Date(end) <= new Date(start)) throw new Error('invalid_event_range');
      patch.start = { dateTime: start };
      patch.end = { dateTime: end };
    }
    if (args.attendee !== undefined) {
      const attendee = attendeeEmail(args.attendee);
      patch.attendees = attendee ? [{ email: attendee }] : [];
    }
    if (!Object.keys(patch).length) throw new Error('missing_event_changes');
    const params = new URLSearchParams({ sendUpdates: 'all' });
    const event = await googleRequest(accessToken, `${eventPath(calendarId, eventId)}?${params}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }, dependencies);
    const serialized = serializeEvent(event);
    await upsertAgentAppointment(database, {
      workspaceId: id,
      externalEventId: serialized.externalEventId,
      calendarId,
      retellCallId: callId,
      summary: serialized.summary,
      startsAt: serialized.startsAt,
      endsAt: serialized.endsAt,
    });
    return { success: true, action, event: serialized };
  }

  throw new Error('invalid_calendar_action');
}
