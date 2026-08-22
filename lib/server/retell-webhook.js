import { createHmac, timingSafeEqual } from 'node:crypto';

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
