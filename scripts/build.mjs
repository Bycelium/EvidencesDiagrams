import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageDirectory = new URL('../', import.meta.url);
const distDirectory = new URL('../dist/', import.meta.url);
const tscPath = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));

await rm(distDirectory, { recursive: true, force: true });

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [tscPath, '-p', 'tsconfig.build.json'], {
    cwd: fileURLToPath(packageDirectory),
    stdio: 'inherit',
  });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`TypeScript build failed with exit code ${code}.`));
  });
});
