const INTRO_BEGIN_MESSAGE = 'Buenas tardes, gracias por llamar. ¿En qué le puedo ayudar hoy?... Esta es una muestra de cómo sonaría su recepcionista virtual de Autivex AI. Elija el tipo de negocio que quiere probar y entramos a la llamada.';

function sendJson(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store');
  res.json(body);
}

export default async function handler(req, res) {
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
    const body = req.body || {};
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
      payload.override_agent_config = { begin_message: INTRO_BEGIN_MESSAGE };
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
