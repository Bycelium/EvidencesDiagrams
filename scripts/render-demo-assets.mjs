import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageDirectory = new URL('../', import.meta.url);
const checkOnly = process.argv.includes('--check');
const temporaryDirectory = checkOnly ? await mkdtemp(join(tmpdir(), 'evidence-demo-assets-')) : null;

const assets = [
  ['demo/favicon.svg', 'demo/favicon-96.png', 96, 96],
  ['demo/favicon.svg', 'demo/apple-touch-icon.png', 180, 180],
];

function exportPng(source, output, width, height) {
  return new Promise((resolve, reject) => {
    const process = spawn('inkscape', [
      source,
      '--export-type=png',
      `--export-filename=${output}`,
      `--export-width=${width}`,
      `--export-height=${height}`,
    ], { cwd: fileURLToPath(packageDirectory), stdio: 'inherit' });
    process.on('error', reject);
    process.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Inkscape exited with status ${code}.`));
    });
  });
}

try {
  for (const [source, output, width, height] of assets) {
    const generatedOutput = checkOnly ? join(temporaryDirectory, output.replaceAll('/', '-')) : output;
    await exportPng(source, generatedOutput, width, height);
    if (checkOnly) {
      const [committed, generated] = await Promise.all([readFile(output), readFile(generatedOutput)]);
      if (!committed.equals(generated)) {
        throw new Error(`${output} is out of date. Run pnpm build:demo-assets and commit the generated asset.`);
      }
    }
  }
} finally {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log(checkOnly ? 'Demo assets are up to date.' : 'Demo assets generated.');
