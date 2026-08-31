// The clickable line that sits under the rendered signature image.
//
// The image carries identity and brand; it cannot carry links, and many clients
// block images outright. This line is the actionable half: real anchors that
// survive image blocking and stay selectable.
//
// Free of Vite-only globals (no `import.meta.env`) so the node suite can import
// it directly. Inline styles only — mail clients strip <style> blocks.

export const SITE_URL = 'https://autivexai.com';
export const BOOKING_URL = 'https://calendly.com/autivex/consultoria';

const FONT_STACK = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
const MUTED = '#4d5b78';
const ACCENT_INK = '#0b6f68';

// Shared by the rendered image and the clickable line so the two halves of the
// signature never drift apart.
export const SIGNATURE_COPY = {
  es: {
    cta: 'Agenda una demo',
    site: 'autivexai.com',
    tagline: 'Recepción de voz con IA para negocios en México',
  },
  en: {
    cta: 'Book a demo',
    site: 'autivexai.com',
    tagline: 'AI voice reception for businesses in Mexico',
  },
};

const COPY = SIGNATURE_COPY;

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function telHref(phone) {
  return `tel:${String(phone).replace(/[^\d+]/g, '')}`;
}

export function buildSignatureLineHtml(fields = {}, locale = 'es') {
  const copy = COPY[locale] || COPY.es;
  const email = escapeHtml(fields.email || '');
  const phone = String(fields.phone || '').trim();
  const link = `color:${ACCENT_INK};text-decoration:none;`;

  const parts = [];
  if (email) parts.push(`<a href="mailto:${email}" style="${link}">${email}</a>`);
  if (phone) parts.push(`<a href="${escapeHtml(telHref(phone))}" style="${link}">${escapeHtml(phone)}</a>`);
  parts.push(`<a href="${BOOKING_URL}" style="${link}font-weight:bold;">${copy.cta}</a>`);
  parts.push(`<a href="${SITE_URL}" style="${link}">${copy.site}</a>`);

  return `<div style="font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${MUTED};">${parts.join(' &nbsp;·&nbsp; ')}</div>`;
}

export function buildSignatureLineText(fields = {}, locale = 'es') {
  const copy = COPY[locale] || COPY.es;
  return [fields.email, fields.phone, `${copy.cta}: ${BOOKING_URL}`, copy.site]
    .filter(Boolean)
    .join(' · ');
}
