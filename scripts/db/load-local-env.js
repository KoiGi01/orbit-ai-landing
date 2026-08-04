import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadLocalEnvironment(rootDirectory) {
  const envPath = resolve(rootDirectory, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}
