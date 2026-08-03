const buckets = new Map();

function firstHeaderValue(value) {
  return String(Array.isArray(value) ? value[0] : value || '').split(',')[0].trim();
}

function clientAddress(req) {
  return firstHeaderValue(req.headers?.['x-forwarded-for'])
    || firstHeaderValue(req.headers?.['x-real-ip'])
    || req.socket?.remoteAddress
    || 'unknown';
}

export function numericEnv(name, fallback, { min = 1, max = 10_000 } = {}) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function consumeRateLimit(req, namespace, limit, windowMs) {
  const now = Date.now();
  const key = `${namespace}:${clientAddress(req)}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfter: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - current.count), retryAfter: 0 };
}

export function requestOriginAllowed(req) {
  const configured = String(process.env.AUTIVEX_PUBLIC_ORIGINS || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (!configured.length) return true;

  const origin = firstHeaderValue(req.headers?.origin).replace(/\/$/, '');
  // Webhooks, health checks and local API tests may not send an Origin header.
  if (!origin) return true;
  return configured.includes(origin);
}
