import { build } from 'esbuild';
import { readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

const functionsDir = './backend/functions';
const functions = readdirSync(functionsDir);

for (const fn of functions) {
  const entryPoint = join(functionsDir, fn, 'handler.ts');
  const outDir = join('./dist', fn);
  mkdirSync(outDir, { recursive: true });

  await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    target: 'node22',
    outfile: join(outDir, 'index.js'),
    external: ['@aws-sdk/*'],  // AWS SDK is available in Lambda runtime
    sourcemap: true,
    minify: false,
  });

  console.log(`Built: ${fn}`);
}
console.log('All Lambda functions built successfully.');
