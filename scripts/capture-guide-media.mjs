#!/usr/bin/env node

/**
 * Capture stills and frame sequences for the documentation guide.
 *
 * Example:
 *   node scripts/capture-guide-media.mjs --output-dir /tmp/evidence-guide \
 *     --playwright-module /path/to/node_modules/@playwright/test/index.js \
 *     --ffmpeg-path /path/to/ffmpeg
 *
 * The caller supplies ffmpeg explicitly; this project does not install it.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_URL = pathToFileURL(resolve(ROOT, 'demo/index.html')).href;

function usage() {
  return `Usage: node scripts/capture-guide-media.mjs --output-dir <directory> [options]

Captures 10 named PNG stills and these PNG frame sequences:
  adding-evidence/, changing-prior/, changing-weight/

Options:
  --url <url>                 Demo URL (default: ${DEFAULT_URL})
  --output-dir <directory>    Destination directory (required)
  --playwright-module <path>  Playwright package or module path (default: @playwright/test)
  --browser-path <path>       Chromium executable path
  --ffmpeg-path <path>        ffmpeg executable used to encode the GIFs
  --frames-per-state <count>  Duplicate each sequence state this many times (default: 12)
  --contact-sheet-only        Render contact-sheet.png from existing stills
  --gifs-only                 Capture only GIF frame sequences
  --no-encode                 Leave frame sequences as PNGs without encoding GIFs
  --headed                    Show the browser while capturing
  --help                      Show this message
`;
}

function parseArguments(args) {
  const options = {
    url: DEFAULT_URL,
    playwrightModule: '@playwright/test',
    framesPerState: 12,
    headed: false,
    contactSheetOnly: false,
    gifsOnly: false,
    noEncode: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') return { help: true };
    if (argument === '--headed') { options.headed = true; continue; }
    if (argument === '--contact-sheet-only') { options.contactSheetOnly = true; continue; }
    if (argument === '--gifs-only') { options.gifsOnly = true; continue; }
    if (argument === '--no-encode') { options.noEncode = true; continue; }
    const field = {
      '--url': 'url',
      '--output-dir': 'outputDir',
      '--playwright-module': 'playwrightModule',
      '--browser-path': 'browserPath',
      '--ffmpeg-path': 'ffmpegPath',
      '--frames-per-state': 'framesPerState',
    }[argument];
    if (!field) throw new Error(`Unknown option: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    options[field] = field === 'framesPerState' ? Number(value) : value;
    index += 1;
  }
  if (!options.outputDir) throw new Error('--output-dir is required.');
  if (!Number.isInteger(options.framesPerState) || options.framesPerState < 1) {
    throw new Error('--frames-per-state must be a positive integer.');
  }
  options.outputDir = resolve(options.outputDir);
  if (options.ffmpegPath) options.ffmpegPath = resolve(options.ffmpegPath);
  return options;
}

async function loadPlaywright(moduleSpecifier) {
  const source = isAbsolute(moduleSpecifier) || moduleSpecifier.startsWith('.')
    ? pathToFileURL(resolve(moduleSpecifier)).href
    : moduleSpecifier;
  try {
    const imported = await import(source);
    const playwright = imported.default ?? imported;
    if (!playwright.chromium?.launch) throw new Error('The module does not export chromium.launch().');
    return playwright;
  } catch (error) {
    throw new Error(
      `Could not load Playwright from ${moduleSpecifier}. Install @playwright/test and its Chromium browser, `
      + 'or pass --playwright-module /absolute/path/to/@playwright/test/index.js. '
      + `Original error: ${error.message}`,
    );
  }
}

async function settle(page) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function setNumberInput(page, selector, value) {
  const input = page.locator(selector);
  await input.fill(String(value));
  await input.dispatchEvent('input');
  await settle(page);
}

async function setRangeInput(page, selector, value) {
  const input = typeof selector === 'string' ? page.locator(selector) : selector;
  await input.evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await settle(page);
}

async function createPage(browser, url, pageErrors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('#category-rows tr').first().waitFor();
  const saturation = await page.locator('#saturation-threshold').evaluate((input) => ({ min: input.min, max: input.max, value: input.value }));
  if (saturation.min !== '5' || saturation.max !== '40' || saturation.value !== '20') {
    throw new Error(`Expected saturation control min 5, max 40, default 20; received ${JSON.stringify(saturation)}.`);
  }
  await settle(page);
  return page;
}

async function applyScenario(page, ids) {
  await page.evaluate((scenarioIds) => {
    const button = scenarioIds
      .map((id) => document.querySelector(`button[data-scenario="${id}"]`))
      .find(Boolean);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`The demo does not provide any required scenario: ${scenarioIds.join(', ')}.`);
    }
    button.click();
  }, ids);
  await settle(page);
}

async function addEvidence(page, categoryId, direction) {
  await page.locator(`tr[data-category-id="${categoryId}"] .add-evidence[data-direction="${direction}"]`).evaluate((button) => button.click());
  await settle(page);
}

async function assertCaptureControlsVisible(page, sequence) {
  const selectors = sequence === 'changing-prior'
    ? ['#prior-min-decibans', '#prior-max-decibans']
    : sequence === 'changing-weight'
      ? ['#category-rows tr[data-capture-active] input[type="range"]']
      : ['tr[data-category-id="default-news-report"] input[type="range"]', 'tr[data-category-id="default-news-report"] .add-evidence'];
  const clipped = await page.evaluate((captureSelectors) => captureSelectors.flatMap((selector) =>
    [...document.querySelectorAll(selector)].flatMap((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || box.width === 0 || box.height === 0) return [];
      return box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight ? [selector] : [];
    }),
  ), selectors);
  if (clipped.length) throw new Error(`Focused ${sequence} controls are clipped: ${[...new Set(clipped)].join(', ')}.`);
}

const NEWS_FOR = 'tr[data-category-id="default-news-report"] input[data-direction="for"]';
const NEWS_AGAINST = 'tr[data-category-id="default-news-report"] input[data-direction="against"]';
const OFFICIAL_DATA_AGAINST = 'tr[data-category-id="default-official-data"] input[data-direction="against"]';

const STILLS = [
  ['no-evidence', []],
  ['color-legend', ['news-report-for']],
  ['add-evidence', ['news-report-for']],
  ['weak-evidence', ['news-report-for']],
  ['positive-agreement', ['three-news-reports-for']],
  ['negative-agreement', ['two-news-reports-against']],
  ['evidence-path', ['official-data-against-two-news-reports-for']],
  ['dissonant-evidence', ['news-report-for-against']],
  ['prior-interval', ['news-report-for']],
  ['exact-prior', ['news-report-for']],
];

async function screenshotStill(page, name, path) {
  const targets = {
    'no-evidence': '.result',
    'color-legend': '#color-legend',
    'add-evidence': '.settings',
    'weak-evidence': '.result',
    'positive-agreement': '.result',
    'negative-agreement': '.result',
    'evidence-path': '.result',
    'dissonant-evidence': '.result',
    'prior-interval': '.result',
    'exact-prior': '.result',
  };
  const target = targets[name];
  if (target) await page.locator(target).screenshot({ path });
  else await page.screenshot({ path });
}

async function captureStills(browser, options, pageErrors) {
  for (const [name, scenarios] of STILLS) {
    const page = await createPage(browser, options.url, pageErrors);
    try {
      if (scenarios.length) await applyScenario(page, scenarios);
      if (['add-evidence', 'prior-interval', 'exact-prior'].includes(name)) {
        await setRangeInput(page, NEWS_FOR, 5);
      }
      if (name === 'weak-evidence') await setRangeInput(page, NEWS_FOR, 2);
      if (name === 'exact-prior') {
        await setNumberInput(page, '#prior-min-decibans', 0);
        await setNumberInput(page, '#prior-max-decibans', 0);
      }
      if (name === 'positive-agreement') {
        await setRangeInput(page, NEWS_FOR, 10);
      }
      if (name === 'negative-agreement') {
        await addEvidence(page, 'default-news-report', 'against');
        await setRangeInput(page, NEWS_AGAINST, 10);
      }
      if (name === 'evidence-path') {
        await page.locator('#reset').click();
        await addEvidence(page, 'default-news-report', 'for');
        await addEvidence(page, 'default-news-report', 'against');
        await addEvidence(page, 'default-news-report', 'for');
      }
      await screenshotStill(page, name, resolve(options.outputDir, `${name}.png`));
    } finally { await page.close(); }
  }
  return STILLS.map(([name]) => `${name}.png`);
}

async function captureSequence(browser, options, pageErrors, name, perform) {
  const directory = resolve(options.outputDir, name);
  await mkdir(directory, { recursive: true });
  const page = await createPage(browser, options.url, pageErrors);
  const compactHeight = name === 'changing-prior' ? 420 : 540;
  await page.setViewportSize({ width: 960, height: compactHeight });
  await page.addStyleTag({ content: `
    html, body { margin: 0; overflow: hidden; background: #f7f9fc; }
    main { width: 940px !important; padding: 0 !important; }
    .introduction, .controls, #color-legend, .illustrative-note, .category-adders,
    .evidence-header, #evidence-history, #trajectory-empty, .weight-band,
    .category-name-cell small, .remove-category { display: none !important; }
    .workspace { display: block !important; width: 940px !important; height: ${compactHeight}px !important; min-height: ${compactHeight}px !important; }
    .main-column { display: block !important; }
    .result { position: static !important; box-sizing: border-box; height: 405px !important; min-height: 405px !important; padding: 8px !important; }
    .cone-viewport { height: 278px !important; }
    .settings { box-sizing: border-box; height: 135px !important; min-height: 135px !important; padding: 7px 10px !important; overflow: hidden !important; }
    .settings-header { display: none !important; }
    .table-wrap { margin: 0 !important; } #category-rows tr { display: none !important; }
    #category-rows tr[data-capture-active] { display: table-row !important; }
    #category-rows { font-size: 14px !important; } #category-rows th, #category-rows td { padding: 3px 5px !important; }
    .weight-setting { gap: 6px !important; } .weight-setting input { width: 110px !important; }
    .weight-actions { margin-top: 0 !important; } .weight-actions button { padding: 2px 7px !important; }
    .prior-bounds { display: none !important; }
  ` });
  await page.evaluate((sequence) => {
    const active = sequence === 'changing-weight'
      ? ['default-news-report', 'default-official-data']
      : ['default-news-report'];
    for (const row of document.querySelectorAll('#category-rows tr')) {
      row.toggleAttribute('data-capture-active', active.includes(row.dataset.categoryId));
    }
    if (sequence === 'changing-prior') {
      document.querySelector('.current-evidence')?.setAttribute('hidden', '');
      const prior = document.querySelector('.prior-bounds');
      if (prior) { prior.hidden = false; prior.style.display = 'block'; prior.style.margin = '0'; }
      document.querySelector('.settings-header')?.setAttribute('hidden', '');
    }
  }, name);
  if (name === 'changing-prior') {
    await page.addStyleTag({ content: `
      .result { height: 340px !important; min-height: 340px !important; } .cone-viewport { height: 212px !important; }
      .settings { height: 80px !important; min-height: 80px !important; } .prior-bounds { display: block !important; margin: 0 !important; }
      .prior-bounds h3 { display: none !important; } .bounds-fields { display: flex !important; gap: 18px !important; }
      .prior-presets, .bounds-help, .bounds-error { display: none !important; }
    ` });
  }
  if (name === 'changing-weight') {
    await page.addStyleTag({ content: '.weight-actions { display: none !important; }' });
  }
  await settle(page);
  let frame = 0;
  async function state(action, repeats = options.framesPerState) {
    await action();
    await settle(page);
    await assertCaptureControlsVisible(page, name);
    const source = resolve(directory, `frame-${String(frame).padStart(3, '0')}.png`);
    await page.screenshot({ path: source });
    frame += 1;
    for (let duplicate = 1; duplicate < repeats; duplicate += 1) {
      await copyFile(source, resolve(directory, `frame-${String(frame).padStart(3, '0')}.png`));
      frame += 1;
    }
  }
  try { await perform(page, state); } finally { await page.close(); }
  return { name, frames: frame };
}

async function captureSequences(browser, options, pageErrors) {
  return [
    await captureSequence(browser, options, pageErrors, 'adding-evidence', async (page, state) => {
      await state(async () => {});
      await state(() => setRangeInput(page, NEWS_FOR, 14));
      await state(() => addEvidence(page, 'default-news-report', 'for'));
      await state(() => addEvidence(page, 'default-news-report', 'for'));
      await state(async () => {
        await addEvidence(page, 'default-news-report', 'for');
        const text = await page.locator('#resultant-label, #probability-text').allTextContents();
        if (!text.some((value) => /\b42\b/.test(value)) || !text.some((value) => /99\.8/.test(value))) {
          throw new Error(`The net-42 extreme GIF state must show 42 dBan and at least 99.8% in English; received ${JSON.stringify(text)}.`);
        }
      }, options.framesPerState * 2);
    }),
    await captureSequence(browser, options, pageErrors, 'changing-prior', async (page, state) => {
      await applyScenario(page, ['news-report-for']);
      await setRangeInput(page, NEWS_FOR, 25);
      await state(async () => {});
      await state(() => setNumberInput(page, '#prior-min-decibans', -10));
      await state(() => setNumberInput(page, '#prior-max-decibans', 10));
      await state(() => setNumberInput(page, '#prior-min-decibans', -5));
      await state(() => setNumberInput(page, '#prior-max-decibans', 5));
      await state(async () => {
        await setNumberInput(page, '#prior-min-decibans', 0);
        await setNumberInput(page, '#prior-max-decibans', 0);
      });
    }),
    await captureSequence(browser, options, pageErrors, 'changing-weight', async (page, state) => {
      await applyScenario(page, ['official-data-against-two-news-reports-for']);
      await state(async () => {});
      await state(() => setRangeInput(page, NEWS_FOR, 18));
      await state(() => setRangeInput(page, NEWS_FOR, 14));
      await state(() => setRangeInput(page, OFFICIAL_DATA_AGAINST, 12));
      await state(() => setRangeInput(page, NEWS_FOR, 8), options.framesPerState * 2);
    }),
  ];
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise(output) : reject(new Error(`${command} exited with ${code}: ${output}`)));
  });
}

async function encodeGif(ffmpegPath, outputDirectory, name) {
  await run(ffmpegPath, [
    '-y', '-framerate', '12', '-i', resolve(outputDirectory, name, 'frame-%03d.png'),
    '-filter_complex', 'scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse',
    '-fps_mode', 'passthrough', '-loop', '0', resolve(outputDirectory, `${name}.gif`),
  ]);
}

async function validateGif(ffmpegPath, outputDirectory, name, expectedFrames, minimumSeconds) {
  const ffprobePath = resolve(dirname(ffmpegPath), 'ffprobe');
  let output;
  try {
    output = await run(ffprobePath, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames:format=duration', '-of', 'json', resolve(outputDirectory, `${name}.gif`)]);
  } catch (error) {
    throw new Error(`Could not inspect ${name}.gif with ffprobe beside --ffmpeg-path: ${error.message}`);
  }
  const report = JSON.parse(output);
  const duration = Number(report.format?.duration);
  const frames = Number(report.streams?.[0]?.nb_read_frames);
  if (!Number.isFinite(duration) || duration < minimumSeconds) {
    throw new Error(`${name}.gif is ${duration}s; expected at least ${minimumSeconds}s.`);
  }
  if (!Number.isInteger(frames) || frames !== expectedFrames) {
    throw new Error(`${name}.gif has ${frames} decoded frames; expected ${expectedFrames}.`);
  }
  return { duration, frames };
}

async function captureContactSheet(browser, options, pageErrors) {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
  const images = await Promise.all(STILLS.map(async ([name]) => ({
    name,
    url: `data:image/png;base64,${(await readFile(resolve(options.outputDir, `${name}.png`))).toString('base64')}`,
  })));
  try {
    await page.setContent(`<!doctype html><title>Guide media contact sheet</title><style>
    body { margin: 24px; background: #e5e7eb; color: #172033; font: 700 18px/1.3 system-ui, sans-serif; }
    h1 { margin: 0 0 20px; } main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
    figure { margin: 0; padding: 12px; background: white; border-radius: 8px; box-shadow: 0 1px 3px #17203330; }
    figcaption { margin: 0 0 8px; } img { display: block; width: 100%; height: 300px; object-fit: contain; object-position: top left; }
  </style><h1>Guide media contact sheet</h1><main>${images.map(({ name, url }) => `<figure><figcaption>${name}.png</figcaption><img src="${url}"></figure>`).join('')}</main>`);
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: resolve(options.outputDir, 'contact-sheet.png'), fullPage: true });
  } finally { await page.close(); }
}

async function main() {
  let options;
  try { options = parseArguments(process.argv.slice(2)); } catch (error) {
    console.error(`${error.message}\n\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) { console.log(usage()); return; }
  if (!options.contactSheetOnly && !options.noEncode && !options.ffmpegPath) {
    console.error('--ffmpeg-path is required to encode the three animated GIFs.');
    process.exitCode = 2;
    return;
  }

  let playwright;
  try { playwright = await loadPlaywright(options.playwrightModule); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  await mkdir(options.outputDir, { recursive: true });
  let browser;
  try {
    browser = await playwright.chromium.launch({
      headless: !options.headed,
      ...(options.browserPath ? { executablePath: resolve(options.browserPath) } : {}),
    });
  } catch (error) {
    console.error(
      `Could not launch Chromium. Run \`npx playwright install chromium\`, or pass --browser-path <executable>. `
      + `Original error: ${error.message}`,
    );
    process.exitCode = 1;
    return;
  }
  try {
    const pageErrors = [];
    const stills = options.contactSheetOnly ? STILLS.map(([name]) => `${name}.png`) : options.gifsOnly ? [] : await captureStills(browser, options, pageErrors);
    const sequences = options.contactSheetOnly ? [] : await captureSequences(browser, options, pageErrors);
    const durationMinimums = { 'adding-evidence': 6, 'changing-prior': 6, 'changing-weight': 6 };
    const gifValidation = {};
    if (!options.noEncode) {
      for (const { name, frames } of sequences) {
        await encodeGif(options.ffmpegPath, options.outputDir, name);
        gifValidation[name] = await validateGif(options.ffmpegPath, options.outputDir, name, frames, durationMinimums[name]);
      }
    }
    if (!options.gifsOnly) await captureContactSheet(browser, options, pageErrors);
    if (pageErrors.length) throw new Error(`The demo raised ${pageErrors.length} uncaught page error(s):\n${pageErrors.join('\n')}`);
    const manifest = { url: options.url, stills, sequences, gifs: sequences.map(({ name }) => `${name}.gif`), gifValidation, ffmpegPath: options.ffmpegPath };
    await writeFile(resolve(options.outputDir, 'capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Captured ${stills.length} stills and ${sequences.length} frame sequences in ${options.outputDir}${options.gifsOnly ? '' : ', plus contact-sheet.png'}.`);
  } finally {
    await browser.close();
  }
}

await main();
