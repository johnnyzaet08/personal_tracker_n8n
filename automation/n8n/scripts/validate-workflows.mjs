import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'workflows');
const required = new Set([
  '00 - Gmail - Ingestion',
  '01 - Email - Router',
  '05 - Local - Email Fixture Ingestion',
  '10 - Finance - Process Candidate',
  '20 - Important Email - Process',
  '90 - Review Queue',
  '98 - System - Connectivity Check',
  '99 - Error Handler',
]);
const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
const ids = new Set();
for (const file of files) {
  const workflow = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
  if (!workflow.id || !workflow.name || !Array.isArray(workflow.nodes) || !workflow.connections) {
    throw new Error(`${file} is not a complete n8n workflow export`);
  }
  if (ids.has(workflow.id)) throw new Error(`Duplicate workflow id ${workflow.id}`);
  ids.add(workflow.id);
  required.delete(workflow.name);
  if (workflow.name === '00 - Gmail - Ingestion') {
    if (workflow.active) throw new Error('Gmail workflow must remain inactive in source control');
    if (!JSON.stringify(workflow).includes('GMAIL_OAUTH_CREDENTIAL_REQUIRED')) {
      throw new Error('Gmail workflow is missing the credential placeholder');
    }
  }
}
if (required.size > 0) throw new Error(`Missing workflows: ${[...required].join(', ')}`);
console.log(`Validated ${files.length} versioned workflows.`);
