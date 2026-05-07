import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { GoogleGenAI } from '@google/genai';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = resolve(process.cwd());
const DIST_DIR = join(ROOT, 'dist');
const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';
const SPEECH_PREFIX_PADDING_MS = 160;
const SPEECH_SILENCE_DURATION_MS = 1250;

loadLocalEnv();

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

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handleToken(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    sendJson(res, 500, { error: 'missing_gemini_api_key' });
    return;
  }

  try {
    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { apiVersion: 'v1alpha' },
    });
    const expireTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: LIVE_MODEL,
          config: {
            responseModalities: ['AUDIO'],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
                endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                prefixPaddingMs: SPEECH_PREFIX_PADDING_MS,
                silenceDurationMs: SPEECH_SILENCE_DURATION_MS,
              },
            },
          },
        },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });

    sendJson(res, 200, {
      token: token.name,
      model: LIVE_MODEL,
      expireTime,
    });
  } catch (error) {
    console.error('Failed to create Gemini Live token:', error?.message || error);
    sendJson(res, 502, { error: 'token_creation_failed' });
  }
}

async function handleRetellToken(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
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

    const payload = { agent_id: agentId };

    if (isIntro) {
      payload.override_agent_config = {
        begin_message: 'Hola, soy la recepcionista virtual de Autivex AI. Esta es una demo de voz que puede integrar en su negocio para contestar llamadas, entender la necesidad del cliente y preparar el seguimiento. En un momento va a ver algunas opciones en pantalla. Elija la que más se parezca a su tipo de negocio o al caso que quiere probar. Después entraremos a una llamada simulada donde usted será el cliente y yo atenderé como lo haría su recepcionista de IA.',
      };
    }

    if (!isIntro && body.scenario) {
      payload.retell_llm_dynamic_variables = {
        business_role: String(body.scenario.business_role || ''),
        customer_context: String(body.scenario.customer_context || ''),
        first_line: String(body.scenario.first_line || ''),
        scenario_label: String(body.scenario.label || ''),
      };
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

  try {
    const body = await readJson(req);
    const lead = {
      receivedAt: new Date().toISOString(),
      name: String(body.name || '').slice(0, 120),
      whatsapp: String(body.whatsapp || '').replace(/\D/g, '').slice(0, 16),
      whatsappConsent: Boolean(body.whatsappConsent),
      source: String(body.source || 'voice_demo').slice(0, 80),
      transcript: Array.isArray(body.transcript) ? body.transcript.slice(-12) : [],
    };
    console.info('Autivex AI demo lead:', lead);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('Failed to capture lead:', error?.message || error);
    sendJson(res, 400, { error: 'invalid_lead_payload' });
  }
}

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
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

  if (pathname === '/api/demo/token') {
    await handleToken(req, res);
    return;
  }

  if (pathname === '/api/demo/lead') {
    await handleLead(req, res);
    return;
  }

  if (pathname === '/api/retell/token') {
    await handleRetellToken(req, res);
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
