// Email signature markup for AutiveX operators.
//
// This module is deliberately free of Vite-only globals (no `import.meta.env`)
// so the node test suite can import it directly.
//
// Email clients are not browsers: Outlook drops webfonts, ignores flexbox and
// grid, and strips <style> blocks. So the signature is a table with inline
// styles and a websafe stack. It will not render in Manrope like the site does.

const SITE_URL = 'https://autivexai.com';
const LOGO_URL = `${SITE_URL}/autivex-signature-logo.png`;
const BOOKING_URL = 'https://calendly.com/autivex/consultoria';

const FONT_STACK = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
const INK = '#0a1735';
const MUTED = '#4d5b78';
const ACCENT = '#0b6f68';
const LINE = '#d8def0';

const COPY = {
  es: {
    tagline: 'Recepción de voz con inteligencia artificial para negocios en México',
    cta: 'Agenda una demo',
    site: 'autivexai.com',
  },
  en: {
    tagline: 'AI voice reception for businesses in Mexico',
    cta: 'Book a demo',
    site: 'autivexai.com',
  },
};

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

export function buildSignatureHtml(fields = {}, locale = 'es') {
  const copy = COPY[locale] || COPY.es;
  const name = escapeHtml(fields.name || '');
  const role = escapeHtml(fields.role || '');
  const email = escapeHtml(fields.email || '');
  const phone = String(fields.phone || '').trim();

  const linkStyle = `color:${ACCENT};text-decoration:none;`;
  const metaStyle = `font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${MUTED};`;

  const contactRows = [];
  if (email) {
    contactRows.push(
      `<a href="mailto:${email}" style="${linkStyle}">${email}</a>`
    );
  }
  if (phone) {
    contactRows.push(
      `<a href="${escapeHtml(telHref(phone))}" style="${linkStyle}">${escapeHtml(phone)}</a>`
    );
  }

  return [
    `<table cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT_STACK};border-collapse:collapse;">`,
    '<tr>',
    `<td style="vertical-align:top;padding-right:16px;">`,
    `<img src="${LOGO_URL}" width="56" height="56" alt="AutiveX" style="display:block;width:56px;height:56px;border:0;outline:none;" />`,
    '</td>',
    `<td style="vertical-align:top;padding-left:16px;border-left:1px solid ${LINE};">`,
    `<div style="font-family:${FONT_STACK};font-size:16px;line-height:22px;font-weight:bold;color:${INK};">${name}</div>`,
    role ? `<div style="${metaStyle}">${role}</div>` : '',
    `<div style="${metaStyle}padding-top:6px;">${contactRows.join(' &nbsp;·&nbsp; ')}</div>`,
    `<div style="${metaStyle}padding-top:6px;">`,
    `<a href="${SITE_URL}" style="${linkStyle}font-weight:bold;">${copy.site}</a>`,
    ` &nbsp;·&nbsp; `,
    `<a href="${BOOKING_URL}" style="${linkStyle}">${copy.cta}</a>`,
    '</div>',
    `<div style="font-family:${FONT_STACK};font-size:12px;line-height:18px;color:${MUTED};padding-top:8px;">${copy.tagline}</div>`,
    '</td>',
    '</tr>',
    '</table>',
  ].filter(Boolean).join('');
}

// Plain-text twin of the signature. The clipboard carries both flavors so a
// paste into a rich editor keeps the layout while a plain-text target still
// gets readable contact details instead of raw markup.
export function buildSignatureText(fields = {}, locale = 'es') {
  const copy = COPY[locale] || COPY.es;
  const contact = [fields.email, fields.phone].filter(Boolean).join(' · ');

  return [
    fields.name || '',
    fields.role || '',
    contact,
    `${copy.site} · ${copy.cta}: ${BOOKING_URL}`,
    copy.tagline,
  ].filter(Boolean).join('\n');
}
