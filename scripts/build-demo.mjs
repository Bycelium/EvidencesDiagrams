import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const packageDirectory = new URL('../', import.meta.url);
const demoDirectory = new URL('demo/', packageDirectory);
const templatePath = new URL('index.template.html', demoDirectory);
const cssPath = new URL('style.css', demoDirectory);
const javaScriptPath = new URL('main.js', demoDirectory);
const outputPath = new URL('index.html', demoDirectory);
const checkOnly = process.argv.includes('--check');

const cssTag = '<link rel="stylesheet" href="./style.css">';
const javaScriptTag = '<script type="module" src="./main.js"></script>';
const generatedComment = '<!-- Generated from demo/index.template.html, demo/style.css, demo/main.js, demo/geometry.js, and demo/diagram-renderer.js by pnpm build:demo. -->\n';

const [htmlTemplate, css, license, notice, result] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(cssPath, 'utf8'),
  readFile(new URL('LICENSE', packageDirectory), 'utf8'),
  readFile(new URL('NOTICE', packageDirectory), 'utf8'),
  build({
    absWorkingDir: fileURLToPath(packageDirectory),
    entryPoints: [fileURLToPath(javaScriptPath)],
    bundle: true,
    charset: 'utf8',
    format: 'iife',
    legalComments: 'none',
    platform: 'browser',
    target: 'es2022',
    write: false,
  }),
]);

if (!htmlTemplate.includes(cssTag) || !htmlTemplate.includes(javaScriptTag)) {
  throw new Error('The demo template no longer contains the expected asset tags.');
}

const embeddedCss = css.replaceAll(/<\/style/giu, '<\\/style');
const embeddedJavaScript = result.outputFiles[0].text.replaceAll(/<\/script/giu, '<\\/script');
const standaloneHtml = htmlTemplate
  .replace(cssTag, () => `<style>\n${embeddedCss}</style>`)
  .replace(javaScriptTag, () => `<script>\n${embeddedJavaScript}</script>`);
const licenseComment = `<!--\n${notice.trim()}\n\n${license.trim()}\n-->\n`;
const generatedHtml = `${generatedComment}${licenseComment}${standaloneHtml}`;

if (checkOnly) {
  const committedHtml = await readFile(outputPath, 'utf8');
  if (committedHtml !== generatedHtml) {
    throw new Error('demo/index.html is out of date. Run pnpm build:demo and commit the generated file.');
  }

  console.log('Standalone demo is up to date.');
} else {
  await writeFile(outputPath, generatedHtml, 'utf8');
  console.log(`Standalone demo generated: ${fileURLToPath(outputPath)}`);
}
