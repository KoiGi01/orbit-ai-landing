import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  buildRetellBusinessPrompt,
  createRetellAgentDraft,
  notifyProvisioningStarted,
  RETELL_PROMPT_TEMPLATE_VERSION,
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
  assert.equal(requests[2].body.voice_model, 'eleven_flash_v2_5');
  assert.equal(requests[2].body.enable_dynamic_responsiveness, true);
  assert.equal(result.agentId, 'agent_new_123');
  assert.equal(result.isPublished, false);
  assert.equal(result.promptTemplateVersion, RETELL_PROMPT_TEMPLATE_VERSION);
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
