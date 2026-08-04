import { cp, copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const npmCli = process.env.npm_execpath;

function run(script) {
  if (!npmCli) throw new Error('missing_npm_execpath');
  const result = spawnSync(process.execPath, [npmCli, 'run', script], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run('build');
run('build:dashboard');

const landing = resolve(ROOT, 'dist');
const dashboard = resolve(ROOT, 'dist-dashboard');
await mkdir(resolve(landing, 'assets'), { recursive: true });
await cp(resolve(dashboard, 'assets'), resolve(landing, 'assets'), {
  recursive: true,
  force: true,
});
await copyFile(resolve(dashboard, 'index.html'), resolve(landing, 'dashboard.html'));

console.info('Combined landing and dashboard build ready in dist/');
