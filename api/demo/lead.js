import { deliverLead, normalizeLead, validLead } from '../../lib/server/lead-delivery.js';
import {
  consumeRateLimit,
  numericEnv,
  requestOriginAllowed,
} from '../../lib/server/public-guard.js';

function sendJson(res, status, body, headers = {}) {
  res.status(status).setHeader('cache-control', 'no-store');
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (!requestOriginAllowed(req)) {
    sendJson(res, 403, { error: 'origin_not_allowed' });
    return;
  }

  const rate = consumeRateLimit(
    req,
    'public-lead',
    numericEnv('LEAD_RATE_LIMIT_PER_HOUR', 4, { max: 100 }),
    60 * 60 * 1000,
  );
  if (!rate.allowed) {
    sendJson(res, 429, { error: 'rate_limited' }, { 'retry-after': String(rate.retryAfter) });
    return;
  }

  try {
    const body = req.body || {};
    // Accept a filled honeypot silently so bots do not learn how to bypass it.
    if (String(body.website || '').trim()) {
      sendJson(res, 200, { ok: true });
      return;
    }

    const lead = normalizeLead(body);
    if (!validLead(lead)) {
      sendJson(res, 400, { error: 'invalid_lead_payload' });
      return;
    }

    const channels = await deliverLead(lead);
    console.info('AutiveX landing lead delivered', {
      id: lead.id,
      source: lead.source,
      channels,
      receivedAt: lead.receivedAt,
    });
    sendJson(res, 200, { ok: true, leadId: lead.id });
  } catch (error) {
    console.error('Failed to capture lead:', error?.message || error);
    sendJson(res, 502, { error: 'lead_delivery_failed' });
  }
}
