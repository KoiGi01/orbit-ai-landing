import {
  buildRetellDemoVariables,
  configuredAgentVersion,
} from '../../lib/server/retell-demo.js';
import {
  consumeRateLimit,
  numericEnv,
  requestOriginAllowed,
} from '../../lib/server/public-guard.js';

const INTRO_BEGIN_MESSAGE = 'Buenas tardes, gracias por llamar. ¿En qué le puedo ayudar hoy? Esta es una muestra de cómo sonaría su recepcionista virtual de AutiveX AI. Elija el tipo de negocio que quiere probar y entramos a la llamada.';

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
    const body = req.body || {};
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
      payload.override_agent_config = { begin_message: INTRO_BEGIN_MESSAGE };
    }

    if (!isIntro) {
      const demo = buildRetellDemoVariables(body.scenario);
      payload.metadata = { source: 'autivex_web_demo', scenario_id: demo.scenarioId };
      payload.retell_llm_dynamic_variables = demo.variables;
    }

    const response = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Retell API error:', response.status, errBody.slice(0, 500));
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
