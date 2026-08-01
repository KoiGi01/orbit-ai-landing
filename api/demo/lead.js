function sendJson(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store');
  res.json(body);
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function sendLeadEmail(lead) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('missing_resend_api_key');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'AutiveX Website <onboarding@resend.dev>',
      to: [process.env.RESEND_TO || 'contact@autivexai.com'],
      subject: `Nueva evaluación de cobertura · ${lead.clinic}`,
      text: [
        'Nueva solicitud desde la landing de AutiveX',
        '',
        `Nombre: ${lead.name}`,
        `Clínica: ${lead.clinic}`,
        `WhatsApp: +${lead.whatsapp}`,
        `Cobertura inicial: ${lead.note}`,
        `Origen: ${lead.source}`,
        `Recibida: ${lead.receivedAt}`,
        '',
        'La persona autorizó contacto por WhatsApp para esta evaluación.',
      ].join('\n'),
    }),
  });

  if (!response.ok) throw new Error(`resend_${response.status}`);
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
      name: cleanText(body.name, 120),
      clinic: cleanText(body.clinic, 160),
      whatsapp: String(body.whatsapp || '').replace(/\D/g, '').slice(0, 15),
      whatsappConsent: Boolean(body.whatsappConsent),
      source: cleanText(body.source || 'landing', 80),
      note: cleanText(body.note || 'Sin especificar', 160),
    };

    if (lead.name.length < 2 || lead.clinic.length < 2 || lead.whatsapp.length < 10 || !lead.whatsappConsent) {
      sendJson(res, 400, { error: 'invalid_lead_payload' });
      return;
    }

    await sendLeadEmail(lead);
    console.info('AutiveX landing lead delivered', { source: lead.source, receivedAt: lead.receivedAt });
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('Failed to capture lead:', error?.message || error);
    sendJson(res, 502, { error: 'lead_delivery_failed' });
  }
}
