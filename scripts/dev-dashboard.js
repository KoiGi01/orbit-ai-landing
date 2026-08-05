import { spawn } from 'node:child_process';

const children = [];

function start(command, args) {
  const child = spawn(command, args, { stdio: 'inherit', shell: false });
  children.push(child);
  return child;
}

start('node', ['server/index.js']);
start(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'dashboard/vite.config.js']);

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
  process.exit(0);
});

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown('SIGTERM');
      process.exit(code);
    }
  });
}
