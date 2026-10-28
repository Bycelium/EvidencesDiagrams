import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'evidences-diagrams-package-'));
const rootManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

function run(command, argumentsList, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, {
      cwd: options.cwd ?? packageRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let errorOutput = '';
    child.stdout.setEncoding('utf8').on('data', (data) => { output += data; });
    child.stderr.setEncoding('utf8').on('data', (data) => { errorOutput += data; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} ${argumentsList.join(' ')} failed (${code}).\n${output}${errorOutput}`));
    });
  });
}

try {
  const packOutput = await run('npm', [
    'pack',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    temporaryDirectory,
  ]);
  const [archive] = JSON.parse(packOutput);
  assert.equal(archive.name, rootManifest.name);
  assert.equal(archive.version, rootManifest.version);

  const files = archive.files.map(({ path }) => path).sort();
  assert.ok(files.includes('dist/index.js'), 'The archive must contain the JavaScript entry point.');
  assert.ok(files.includes('dist/index.d.ts'), 'The archive must contain TypeScript declarations.');
  assert.ok(files.includes('README.md'), 'The archive must contain the README.');
  assert.ok(files.includes('LICENSE'), 'The archive must contain the license.');
  assert.ok(files.includes('NOTICE'), 'The archive must contain attribution notices.');
  assert.ok(files.includes('package.json'), 'The archive must contain its metadata.');
  assert.deepEqual(
    files.filter((file) => !/^(?:dist\/.+\.(?:js|d\.ts)|README\.md|LICENSE|NOTICE|package\.json)$/.test(file)),
    [],
    'The archive contains a file outside the publication allowlist.',
  );

  const consumerDirectory = join(temporaryDirectory, 'consumer');
  await mkdir(consumerDirectory);
  await writeFile(join(consumerDirectory, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      [rootManifest.name]: `file:${join(temporaryDirectory, archive.filename)}`,
    },
  }, null, 2));
  await run('npm', [
    'install',
    '--ignore-scripts',
    '--package-lock=false',
    '--offline',
    '--no-audit',
    '--no-fund',
  ], { cwd: consumerDirectory });

  const source = `import assert from 'node:assert/strict';
import { aggregateEvidence, buildEvidenceDiagram } from '@bycelium/evidences-diagrams';

assert.deepEqual(aggregateEvidence([{ weightDecibans: 12 }, { weightDecibans: -5 }]), {
  netWeightDecibans: 7,
  absoluteWeightDecibans: 17,
  dissonance: 1 - 7 / 17,
});
assert.equal(
  buildEvidenceDiagram([{ id: 'evidence', weightDecibans: 20 }]).probability.text,
  'Probability ≥ 75 %',
);
`;
  await writeFile(join(consumerDirectory, 'index.mjs'), source);
  await writeFile(join(consumerDirectory, 'index.ts'), `import {
  aggregateEvidence,
  type EvidenceSummary,
} from '@bycelium/evidences-diagrams';

const summary: EvidenceSummary = aggregateEvidence([{ weightDecibans: 12 }]);
const expected: number = summary.netWeightDecibans;
void expected;
`);
  await run(process.execPath, ['index.mjs'], { cwd: consumerDirectory });

  const tscPath = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
  await run(process.execPath, [
    tscPath,
    '--noEmit',
    '--strict',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--target',
    'ESNext',
    'index.ts',
  ], { cwd: consumerDirectory });

  const installedManifest = JSON.parse(await readFile(
    join(consumerDirectory, 'node_modules/@bycelium/evidences-diagrams/package.json'),
    'utf8',
  ));
  assert.equal(installedManifest.name, rootManifest.name);
  assert.equal(installedManifest.version, rootManifest.version);
  assert.equal(installedManifest.license, 'Apache-2.0');
  for (const name of ['LICENSE', 'NOTICE']) {
    assert.equal(
      await readFile(join(consumerDirectory, 'node_modules/@bycelium/evidences-diagrams', name), 'utf8'),
      await readFile(join(packageRoot, name), 'utf8'),
      `The installed ${name} must preserve the project notice.`,
    );
  }
  console.log(`Archive validated: ${archive.filename} (${files.length} files).`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
