import { resolve } from 'node:path';
import { ensureRetellCommunityVoices } from '../../lib/server/retell-provisioning.js';
import { loadLocalEnvironment } from '../db/load-local-env.js';

const ROOT = resolve(import.meta.dirname, '../..');
loadLocalEnvironment(ROOT);

const results = await ensureRetellCommunityVoices();

for (const result of results) {
  const suffix = result.voiceId ? ` -> ${result.voiceId}` : '';
  console.info(`${result.status.padEnd(9)} ${result.voiceName}${suffix}`);
}

if (results.some((result) => result.status === 'not_found')) {
  console.error('At least one voice is no longer in the ElevenLabs community library.');
  process.exitCode = 1;
}
