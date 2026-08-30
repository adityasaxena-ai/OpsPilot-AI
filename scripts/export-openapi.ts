import { buildApp } from '../apps/api/src/app.js';
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  process.env['NODE_ENV'] = 'test';
  process.env['ENABLE_DEMO_AUTH'] = 'false';

  const app = await buildApp();
  await app.ready();

  const openapiSpec = app.swagger();
  const jsonOutput = JSON.stringify(openapiSpec, null, 2);

  // Find root path (parent of apps/api or current working directory)
  const rootDir = process.cwd().endsWith('apps/api')
    ? path.resolve(process.cwd(), '../../')
    : process.cwd();

  const targetPath = path.join(rootDir, 'openapi.json');
  await fs.writeFile(targetPath, jsonOutput, 'utf8');

  console.log(`✅ OpenAPI 3.0 specification exported successfully to ${targetPath}`);
  await app.close();

}

main().catch((err) => {
  console.error('❌ Failed to export OpenAPI spec:', err);
  process.exit(1);
});
