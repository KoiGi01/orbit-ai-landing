import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  markWebhookEventStatus,
  recordWebhookEvent,
  resolveWebhookWorkspace,
  upsertCallAnalyzed,
  upsertCallEnded,
  upsertCallStarted,
} from './crm-foundation.js';

const SIGNATURE_RE = /^v=(\d+),d=([0-9a-f]{64})$/i;
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

export async function readRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function verifyRetellWebhookSignature(rawBody, signatureHeader, apiKey, { now = Date.now() } = {}) {
  if (!apiKey) return false;
  const match = SIGNATURE_RE.exec(String(signatureHeader || '').trim());
  if (!match) return false;

  const [, timestampText, digestHex] = match;
  const timestamp = Number(timestampText);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > MAX_SIGNATURE_AGE_MS) return false;

  const expectedHex = createHmac('sha256', apiKey).update(`${rawBody}${timestampText}`).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(digestHex, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

const HANDLED_EVENTS = new Set(['call_started', 'call_ended', 'call_analyzed']);

export async function handleRetellWebhookRequest({ rawBody, signatureHeader, database, dependencies = {} }) {
  const env = dependencies.env || process.env;
  const apiKey = env.RETELL_API_KEY;
  if (!verifyRetellWebhookSignature(rawBody, signatureHeader, apiKey)) {
    return { status: 401, body: { error: 'invalid_signature' } };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'invalid_json_payload' } };
  }

  const event = String(payload.event || '');
  const call = payload.call || {};
  const externalCallId = String(call.call_id || '');
  if (!HANDLED_EVENTS.has(event) || !externalCallId) {
    return { status: 204, body: null };
  }

  const dynamicVariables = call.retell_llm_dynamic_variables || {};
  const workspaceId = await resolveWebhookWorkspace(database, dynamicVariables.workspace_id);
  if (!workspaceId) return { status: 204, body: null };

  const eventKey = `${event}:${externalCallId}`;
  const payloadSha256 = createHash('sha256').update(rawBody).digest('hex');
  const safePayload = {
    event,
    callId: externalCallId,
    callType: call.call_type || null,
    callStatus: call.call_status || null,
  };
  const eventId = await recordWebhookEvent(database, {
    workspaceId, eventKey, eventType: event, externalObjectId: externalCallId, payloadSha256, safePayload,
  });
  if (!eventId) return { status: 204, body: null };

  try {
    if (event === 'call_started') {
      await upsertCallStarted(database, {
        workspaceId,
        externalCallId,
        channel: call.call_type === 'phone_call' ? 'phone' : 'web',
        direction: call.direction === 'outbound' ? 'outbound' : 'inbound',
        fromPhone: call.from_number || null,
        toPhone: call.to_number || null,
        startedAt: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
      });
    } else if (event === 'call_ended') {
      await upsertCallEnded(database, {
        workspaceId,
        externalCallId,
        endedAt: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null,
        durationSeconds: call.start_timestamp && call.end_timestamp
          ? Math.max(0, Math.round((call.end_timestamp - call.start_timestamp) / 1000))
          : null,
      });
    } else {
      const analysis = call.call_analysis || {};
      await upsertCallAnalyzed(database, {
        workspaceId,
        externalCallId,
        summary: analysis.call_summary || null,
        inVoicemail: analysis.in_voicemail === true,
        callSuccessful: analysis.call_successful,
        analysis,
      });
    }
    await markWebhookEventStatus(database, eventId, 'processed');
    return { status: 204, body: null };
  } catch (error) {
    await markWebhookEventStatus(database, eventId, 'failed', String(error?.message || 'unknown').slice(0, 120));
    return { status: 502, body: { error: 'webhook_processing_failed' } };
  }
}
