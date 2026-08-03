import { randomUUID } from 'node:crypto';

export function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function normalizeLead(body = {}) {
  return {
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    name: cleanText(body.name, 120),
    clinic: cleanText(body.clinic, 160),
    whatsapp: String(body.whatsapp || '').replace(/\D/g, '').slice(0, 15),
    whatsappConsent: Boolean(body.whatsappConsent),
    source: cleanText(body.source || 'landing', 80),
    note: cleanText(body.note || 'Sin especificar', 240),
  };
}

export function validLead(lead) {
  return lead.name.length >= 2
    && lead.clinic.length >= 2
    && lead.whatsapp.length >= 10
    && lead.whatsapp.length <= 15
    && lead.whatsappConsent;
}

async function sendLeadWebhook(lead) {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) return null;

  const headers = { 'content-type': 'application/json' };
  if (process.env.LEAD_WEBHOOK_SECRET) {
    headers.authorization = `Bearer ${process.env.LEAD_WEBHOOK_SECRET}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ event: 'lead.created', version: 1, lead }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) throw new Error(`lead_webhook_${response.status}`);
  return 'webhook';
}

async function sendLeadEmail(lead) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const recipients = String(process.env.RESEND_TO || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!apiKey || !from || !recipients.length) return null;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `Nueva evaluación de cobertura · ${lead.clinic}`,
      text: [
        'Nueva solicitud desde la landing de AutiveX',
        '',
        `ID: ${lead.id}`,
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
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) throw new Error(`resend_${response.status}`);
  return 'email';
}

export async function deliverLead(lead) {
  const webhookConfigured = Boolean(process.env.LEAD_WEBHOOK_URL);
  const deliveries = [];
  if (webhookConfigured) deliveries.push(sendLeadWebhook(lead));
  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM && process.env.RESEND_TO) {
    deliveries.push(sendLeadEmail(lead));
  }

  if (!deliveries.length) throw new Error('lead_delivery_not_configured');

  const results = await Promise.allSettled(deliveries);
  const channels = results
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value);

  // When n8n is configured it is the system of record; an email notification
  // must never hide a failed persistence step.
  if (webhookConfigured && !channels.includes('webhook')) {
    const webhookResult = results[0];
    throw new Error(`lead_persistence_failed:${webhookResult.reason?.message || 'unknown'}`);
  }

  if (!channels.length) {
    const reasons = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason?.message || 'unknown')
      .join(',');
    throw new Error(`lead_delivery_failed:${reasons}`);
  }

  return channels;
}
