import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadLocalEnvironment(rootDirectory) {
  for (const name of ['.env', '.env.local']) {
    const envPath = resolve(rootDirectory, name);
    if (existsSync(envPath)) process.loadEnvFile(envPath);
  }
}
