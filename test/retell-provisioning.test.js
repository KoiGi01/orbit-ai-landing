import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  buildRetellBusinessPrompt,
  createRetellAgentDraft,
  listRetellMexicanVoices,
  notifyProvisioningStarted,
  RETELL_PROMPT_TEMPLATE_VERSION,
  updateRetellAgentVoice,
  updateRetellCalendarIntegration,
} from '../lib/server/retell-provisioning.js';

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('builds a concise Mexican Spanish business prompt without private notes', () => {
  const prompt = buildRetellBusinessPrompt({
    clinicName: 'Clínica Centro',
    industry: 'Clínica dental',
    city: 'Mérida',
    services: ['Limpieza', 'Ortodoncia'],
    callGoals: ['Agendar una consulta'],
    internalNotes: 'No compartir este texto secreto',
  });

  assert.match(prompt, /Clínica Centro/);
  assert.match(prompt, /español mexicano natural/);
  assert.match(prompt, /Limpieza; Ortodoncia/);
  assert.doesNotMatch(prompt, /texto secreto/);
});

test('creates an unpublished Retell draft from the configured template', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/get-agent/agent_template_123')) {
      return jsonResponse({
        agent_id: 'agent_template_123',
        version: 7,
        voice_id: '11labs-Claudia',
        voice_model: 'eleven_flash_v2_5',
      });
    }
    if (url.endsWith('/create-retell-llm')) return jsonResponse({ llm_id: 'llm_new_123', version: 0 });
    if (url.endsWith('/create-agent')) {
      return jsonResponse({ agent_id: 'agent_new_123', version: 0, is_published: false });
    }
    throw new Error(`unexpected_request:${url}`);
  };

  const result = await createRetellAgentDraft({
    workspaceId: 'workspace-123',
    clerkOrganizationId: 'org_123',
    profile: {
      clinicName: 'Negocio Ejemplo',
      industry: 'Servicios profesionales',
      timezone: 'America/Mexico_City',
    },
  }, {
    env: {
      RETELL_API_KEY: 'test-key',
      RETELL_PROVISIONING_TEMPLATE_AGENT_ID: 'agent_template_123',
    },
    fetchImpl,
  });

  assert.equal(requests.length, 3);
  assert.equal(requests[1].body.model, 'gpt-4.1');
  assert.equal(requests[1].body.default_dynamic_variables.workspace_id, 'workspace-123');
  assert.equal(requests[2].body.response_engine.llm_id, 'llm_new_123');
  assert.equal(requests[2].body.language, 'es-419');
  assert.equal(requests[2].body.voice_id, 'cartesia-Sofia');
  assert.equal(requests[2].body.voice_emotion, 'calm');
  assert.equal(requests[2].body.voice_model, undefined);
  assert.equal(requests[2].body.enable_dynamic_responsiveness, true);
  assert.equal(requests[2].body.webhook_url, undefined);
  assert.equal(result.agentId, 'agent_new_123');
  assert.equal(result.isPublished, false);
  assert.equal(result.promptTemplateVersion, RETELL_PROMPT_TEMPLATE_VERSION);
  assert.equal(result.voiceId, 'cartesia-Sofia');
});

test('points the new agent at the deployed webhook receiver when AUTIVEX_APP_URL is configured', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/get-agent/agent_template_123')) return jsonResponse({ agent_id: 'agent_template_123', voice_id: '11labs-Claudia' });
    if (url.endsWith('/create-retell-llm')) return jsonResponse({ llm_id: 'llm_new_123' });
    if (url.endsWith('/create-agent')) return jsonResponse({ agent_id: 'agent_new_123' });
    throw new Error(`unexpected_request:${url}`);
  };

  await createRetellAgentDraft({
    workspaceId: 'workspace-123',
    clerkOrganizationId: 'org_123',
    profile: { clinicName: 'Negocio Ejemplo' },
  }, {
    env: {
      RETELL_API_KEY: 'test-key',
      RETELL_PROVISIONING_TEMPLATE_AGENT_ID: 'agent_template_123',
      AUTIVEX_APP_URL: 'https://autivexai.com/',
    },
    fetchImpl,
  });

  assert.equal(requests[2].body.webhook_url, 'https://autivexai.com/api/retell/webhook');
});

test('omits webhook_url when AUTIVEX_APP_URL is not a real https address', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/get-agent/agent_template_123')) return jsonResponse({ agent_id: 'agent_template_123', voice_id: '11labs-Claudia' });
    if (url.endsWith('/create-retell-llm')) return jsonResponse({ llm_id: 'llm_new_123' });
    if (url.endsWith('/create-agent')) return jsonResponse({ agent_id: 'agent_new_123' });
    throw new Error(`unexpected_request:${url}`);
  };

  await createRetellAgentDraft({
    workspaceId: 'workspace-123',
    clerkOrganizationId: 'org_123',
    profile: { clinicName: 'Negocio Ejemplo' },
  }, {
    env: {
      RETELL_API_KEY: 'test-key',
      RETELL_PROVISIONING_TEMPLATE_AGENT_ID: 'agent_template_123',
      AUTIVEX_APP_URL: 'http://127.0.0.1:4184',
    },
    fetchImpl,
  });

  assert.equal(requests[2].body.webhook_url, undefined);
});

test('keeps the template voice model only for an ElevenLabs selection', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/get-agent/agent_template_123')) return jsonResponse({ agent_id: 'agent_template_123', voice_id: '11labs-Claudia', voice_model: 'eleven_flash_v2_5' });
    if (url.endsWith('/create-retell-llm')) return jsonResponse({ llm_id: 'llm_new_123' });
    if (url.endsWith('/create-agent')) return jsonResponse({ agent_id: 'agent_new_123' });
    throw new Error(`unexpected_request:${url}`);
  };

  await createRetellAgentDraft({
    workspaceId: 'workspace-123',
    clerkOrganizationId: 'org_123',
    profile: { clinicName: 'Negocio Ejemplo', voiceProvider: 'elevenlabs', voicePreset: 'gaby_warm' },
  }, {
    env: { RETELL_API_KEY: 'test-key', RETELL_PROVISIONING_TEMPLATE_AGENT_ID: 'agent_template_123' },
    fetchImpl,
  });

  assert.equal(requests[2].body.voice_id, '11labs-Gaby');
  assert.equal(requests[2].body.voice_model, 'eleven_flash_v2_5');
  assert.equal(requests[2].body.voice_emotion, undefined);
});

test('lists every Mexican voice and updates an agent with a validated selection', async () => {
  const requests = [];
  const catalog = [
    { voice_id: 'cartesia-Sofia', voice_name: 'Sofia', provider: 'cartesia', accent: 'Mexican', gender: 'Female', age: 'Middle Aged', preview_audio_url: 'https://example.test/sofia.mp3' },
    { voice_id: '11labs-Gaby', voice_name: 'Gaby', provider: 'elevenlabs', accent: 'Mexican', gender: 'female', age: 'Young' },
    { voice_id: 'cartesia-Isabel', voice_name: 'Isabel', provider: 'cartesia', accent: 'Spanish', gender: 'female', age: 'Middle Aged' },
  ];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/list-voices')) return jsonResponse(catalog);
    if (url.endsWith('/update-agent/agent_new_123')) return jsonResponse({ agent_id: 'agent_new_123', version: 4 });
    throw new Error(`unexpected_request:${url}`);
  };
  const dependencies = { env: { RETELL_API_KEY: 'test-key' }, fetchImpl };

  const voices = await listRetellMexicanVoices(dependencies);
  assert.deepEqual(voices.map((voice) => voice.id).sort(), ['11labs-Gaby', 'cartesia-Sofia']);
  const result = await updateRetellAgentVoice('agent_new_123', 'cartesia-Sofia', dependencies);

  assert.equal(result.voice.name, 'Sofia');
  assert.deepEqual(requests.at(-1).body, { voice_id: 'cartesia-Sofia', voice_model: null, voice_emotion: 'calm' });
});

test('rejects a voice that is not in the live Mexican catalog', async () => {
  const fetchImpl = async () => jsonResponse([{ voice_id: 'cartesia-Isabel', voice_name: 'Isabel', provider: 'cartesia', accent: 'Spanish' }]);
  await assert.rejects(
    updateRetellAgentVoice('agent_new_123', 'cartesia-Isabel', { env: { RETELL_API_KEY: 'test-key' }, fetchImpl }),
    /invalid_mexican_voice/,
  );
});

test('adds a Location-scoped Google Calendar tool without removing other tools', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/get-retell-llm/llm_new_123')) return jsonResponse({ general_tools: [{ type: 'custom', name: 'lookup_patient' }, { type: 'end_call', name: 'end_call' }] });
    if (url.endsWith('/update-retell-llm/llm_new_123')) return jsonResponse({ llm_id: 'llm_new_123', version: 2 });
    throw new Error(`unexpected_request:${url}`);
  };
  await updateRetellCalendarIntegration({ llmId: 'llm_new_123', calendarId: 'clinic@group.calendar.google.com' }, { env: { RETELL_API_KEY: 'test-key', RETELL_CALENDAR_WEBHOOK_URL: 'https://n8n.example.test/calendar' }, fetchImpl });
  const tools = requests.at(-1).body.general_tools;
  assert.deepEqual(tools.map((tool) => tool.name), ['lookup_patient', 'manage_calendar', 'end_call']);
  assert.equal(tools[1].parameters.properties.calendarId.const, 'clinic@group.calendar.google.com');
  assert.equal(tools[1].url, 'https://n8n.example.test/calendar');
});

test('signs the shared n8n provisioning event and keeps its id deterministic', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  };
  const input = {
    workspaceId: 'workspace-123',
    clerkOrganizationId: 'org_123',
    agentId: 'agent_new_123',
    llmId: 'llm_new_123',
    promptTemplateVersion: RETELL_PROMPT_TEMPLATE_VERSION,
    requestedIntegrations: ['autivex_crm', 'google_calendar'],
  };
  const dependencies = {
    env: {
      AUTIVEX_PROVISIONING_WEBHOOK_URL: 'https://n8n.example.test/webhook/provision-client',
      AUTIVEX_PROVISIONING_WEBHOOK_SECRET: 'shared-secret',
    },
    fetchImpl,
  };

  const first = await notifyProvisioningStarted(input, dependencies);
  const second = await notifyProvisioningStarted(input, dependencies);
  const expectedSignature = createHmac('sha256', 'shared-secret')
    .update(request.options.body)
    .digest('hex');

  assert.equal(first.eventId, second.eventId);
  assert.equal(first.status, 'delivered');
  assert.equal(request.options.headers['x-autivex-signature'], `sha256=${expectedSignature}`);
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.event, 'workspace.provisioning_started');
  assert.deepEqual(payload.requestedIntegrations, ['autivex_crm', 'google_calendar']);
});
