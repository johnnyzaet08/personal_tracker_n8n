import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..', '..');
const run = (args, capture = false) => {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    shell: false,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || `docker compose ${args.join(' ')} failed`);
  return result.stdout ?? '';
};

run(['stop', 'n8n']);
try {
  const output = run(
    ['run', '--rm', '--no-deps', 'n8n', 'execute', '--id=10000000-0000-4000-8000-000000000098'],
    true,
  );
  if (
    !output.includes('"path": "n8n -> api -> postgresql"') ||
    !output.includes('"status": "healthy"')
  ) {
    throw new Error(`Connectivity workflow did not return the expected result:\n${output}`);
  }
  console.log('Connectivity verified: n8n -> API -> PostgreSQL.');
} finally {
  run(['up', '-d', '--no-deps', 'n8n']);
}
