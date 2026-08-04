import { resolve } from 'node:path';
import { provisionMvpFoundation } from '../../lib/server/crm-foundation.js';
import { createDatabase } from '../../lib/server/database.js';
import { loadLocalEnvironment } from './load-local-env.js';

const ROOT = resolve(import.meta.dirname, '../..');
loadLocalEnvironment(ROOT);

const database = createDatabase();

try {
  const result = await provisionMvpFoundation(database, {
    clerkOrganizationId: process.env.AUTIVEX_MVP_CLERK_ORG_ID,
    displayName: process.env.AUTIVEX_MVP_WORKSPACE_NAME,
    timezone: process.env.AUTIVEX_MVP_TIMEZONE,
    externalAgentId: process.env.AUTIVEX_MVP_RETELL_AGENT_ID || process.env.RETELL_AGENT_ID_2,
    externalAgentVersion: process.env.RETELL_AGENT_VERSION_2,
    agentDisplayName: 'Lucía MVP',
  });

  console.info('AutiveX MVP foundation ready');
  console.info(JSON.stringify(result, null, 2));
} finally {
  await database.close();
}
