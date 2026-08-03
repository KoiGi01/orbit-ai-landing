import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import {
  confirmManualPayment,
  createPaidClinic,
  errorResponse as controlErrorResponse,
  getWorkspace,
  listClinics,
  saveProvisioning,
  saveProspectProfile,
  transitionClinic,
} from '../lib/server/clerk-control.js';
import { deliverLead, normalizeLead, validLead } from '../lib/server/lead-delivery.js';
import {
  buildRetellDemoVariables,
  configuredAgentVersion,
} from '../lib/server/retell-demo.js';
import {
  consumeRateLimit,
  numericEnv,
  requestOriginAllowed,
} from '../lib/server/public-guard.js';

const ROOT = resolve(process.cwd());
loadLocalEnv();

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const DIST_DIR = join(ROOT, 'dist');

function loadLocalEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handleRetellToken(req, res) {
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
    'public-retell',
    numericEnv('RETELL_DEMO_RATE_LIMIT_PER_15_MIN', 6, { max: 100 }),
    15 * 60 * 1000,
  );
  if (!rate.allowed) {
    sendJson(res, 429, { error: 'rate_limited' }, { 'retry-after': String(rate.retryAfter) });
    return;
  }

  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, { error: 'missing_retell_api_key' });
    return;
  }

  try {
    const body = await readJson(req);
    const isIntro = body.type === 'intro';
    const agentId = isIntro
      ? process.env.RETELL_AGENT_ID
      : process.env.RETELL_AGENT_ID_2;

    if (!agentId) {
      sendJson(res, 500, { error: 'missing_agent_id' });
      return;
    }

    const agentVersion = configuredAgentVersion(isIntro
      ? process.env.RETELL_AGENT_VERSION
      : process.env.RETELL_AGENT_VERSION_2);
    const payload = {
      agent_id: agentId,
      ...(agentVersion !== null ? { agent_version: agentVersion } : {}),
    };

    if (isIntro) {
      payload.override_agent_config = {
        begin_message: 'Hola, soy la recepcionista virtual de Autivex AI. Esta es una demo de voz que puede integrar en su negocio para contestar llamadas, entender la necesidad del cliente y preparar el seguimiento. En un momento va a ver algunas opciones en pantalla. Elija la que más se parezca a su tipo de negocio o al caso que quiere probar. Después entraremos a una llamada simulada donde usted será el cliente y yo atenderé como lo haría su recepcionista de IA.',
      };
    }

    if (!isIntro) {
      const demo = buildRetellDemoVariables(body.scenario);
      payload.metadata = { source: 'autivex_web_demo', scenario_id: demo.scenarioId };
      payload.retell_llm_dynamic_variables = demo.variables;
    }

    const response = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Retell API error:', response.status, errBody);
      sendJson(res, 502, { error: 'retell_api_error' });
      return;
    }

    const data = await response.json();
    sendJson(res, 200, { accessToken: data.access_token, callId: data.call_id });
  } catch (error) {
    console.error('Retell token failed:', error?.message || error);
    sendJson(res, 502, { error: 'retell_token_failed' });
  }
}

async function handleLead(req, res) {
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
    const body = await readJson(req);
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

async function handleWorkspace(req, res) {
  if (!['GET', 'PUT'].includes(req.method)) {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    const workspace = req.method === 'GET'
      ? await getWorkspace(req.headers.authorization)
      : await saveProspectProfile(req.headers.authorization, (await readJson(req)).profile);
    sendJson(res, 200, { workspace });
  } catch (error) {
    const response = controlErrorResponse(error);
    sendJson(res, response.status, response.body);
  }
}

async function handleInternalClinics(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const query = new URL(req.url, `http://${req.headers.host}`).searchParams.get('query') || '';
      const result = await listClinics(req.headers.authorization, query);
      sendJson(res, 200, result);
      return;
    }

    const body = await readJson(req);
    if (req.method === 'POST') {
      const clinic = await createPaidClinic(req.headers.authorization, body);
      sendJson(res, 201, { clinic });
      return;
    }

    const clinic = body.action === 'confirm_payment'
      ? await confirmManualPayment(req.headers.authorization, body.organizationId, body.payment)
      : body.action === 'save_provisioning'
        ? await saveProvisioning(req.headers.authorization, body.organizationId, body.provisioning)
      : await transitionClinic(req.headers.authorization, body.organizationId, body.action, body.confirmation);
    sendJson(res, 200, { clinic });
  } catch (error) {
    const response = controlErrorResponse(error);
    sendJson(res, response.status, response.body);
  }
}

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
]);

async function serveStatic(req, res) {
  let pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname === '/') pathname = '/index.html';
  const filePath = resolve(DIST_DIR, `.${pathname}`);

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    const content = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME_TYPES.get(extname(target)) || 'application/octet-stream',
    });
    res.end(content);
  } catch {
    const fallback = await readFile(join(DIST_DIR, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fallback);
  }
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

  if (pathname === '/api/demo/lead') {
    await handleLead(req, res);
    return;
  }

  if (pathname === '/api/retell/token') {
    await handleRetellToken(req, res);
    return;
  }

  if (pathname === '/api/workspace') {
    await handleWorkspace(req, res);
    return;
  }

  if (pathname === '/api/internal/clinics') {
    await handleInternalClinics(req, res);
    return;
  }

  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  if (existsSync(DIST_DIR)) {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
});

server.listen(PORT, HOST, () => {
  console.info(`Autivex AI API server listening on http://${HOST}:${PORT}`);
});
