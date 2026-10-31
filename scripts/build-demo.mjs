import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const packageDirectory = new URL('../', import.meta.url);
const demoDirectory = new URL('demo/', packageDirectory);
const templatePath = new URL('index.template.html', demoDirectory);
const cssPath = new URL('style.css', demoDirectory);
const javaScriptPath = new URL('main.js', demoDirectory);
const faviconPath = new URL('favicon.svg', demoDirectory);
const outputPath = new URL('index.html', demoDirectory);
const checkOnly = process.argv.includes('--check');

const cssTag = '<link rel="stylesheet" href="./style.css">';
const javaScriptTag = '<script type="module" src="./main.js"></script>';
const faviconTag = '<link rel="icon" href="./favicon.svg" type="image/svg+xml" sizes="any">';
const generatedComment = '<!-- Generated from demo/index.template.html, demo/style.css, demo/favicon.svg, demo/main.js, demo/color-legend.js, demo/geometry.js, and demo/diagram-renderer.js by pnpm build:demo. -->\n';

function pngDimensions(content) {
  const signature = '89504e470d0a1a0a';
  if (content.length < 24 || content.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('Expected a PNG asset.');
  }
  return [content.readUInt32BE(16), content.readUInt32BE(20)];
}

async function verifyPngAsset(path, width, height) {
  const dimensions = pngDimensions(await readFile(path));
  if (dimensions[0] !== width || dimensions[1] !== height) {
    throw new Error(`${fileURLToPath(path)} must be ${width}×${height}px.`);
  }
}

const [htmlTemplate, css, favicon, license, notice, result] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(cssPath, 'utf8'),
  readFile(faviconPath, 'utf8'),
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

await Promise.all([
  verifyPngAsset(new URL('social-preview.png', demoDirectory), 1200, 630),
  verifyPngAsset(new URL('favicon-96.png', demoDirectory), 96, 96),
  verifyPngAsset(new URL('apple-touch-icon.png', demoDirectory), 180, 180),
]);

if (!htmlTemplate.includes(cssTag) || !htmlTemplate.includes(javaScriptTag) || !htmlTemplate.includes(faviconTag)) {
  throw new Error('The demo template no longer contains the expected asset tags.');
}

const embeddedCss = css.replaceAll(/<\/style/giu, '<\\/style');
const embeddedJavaScript = result.outputFiles[0].text.replaceAll(/<\/script/giu, '<\\/script');
const embeddedFavicon = Buffer.from(favicon).toString('base64');
const standaloneHtml = htmlTemplate
  .replace(cssTag, () => `<style>\n${embeddedCss}</style>`)
  .replace(javaScriptTag, () => `<script>\n${embeddedJavaScript}</script>`)
  .replace(faviconTag, () => `<link rel="icon" href="data:image/svg+xml;base64,${embeddedFavicon}" type="image/svg+xml" sizes="any">`);
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
