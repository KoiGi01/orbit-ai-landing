function sendJson(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store');
  res.json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const lead = {
      receivedAt: new Date().toISOString(),
      name: String(body.name || '').slice(0, 120),
      whatsapp: String(body.whatsapp || '').replace(/\D/g, '').slice(0, 16),
      whatsappConsent: Boolean(body.whatsappConsent),
      source: String(body.source || 'voice_demo').slice(0, 80),
      transcript: Array.isArray(body.transcript) ? body.transcript.slice(-12) : [],
    };
    console.info('AutiveX AI demo lead:', lead);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('Failed to capture lead:', error?.message || error);
    sendJson(res, 400, { error: 'invalid_lead_payload' });
  }
}
