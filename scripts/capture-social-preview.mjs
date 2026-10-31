import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const playwrightModule = option('--playwright-module');
const browserPath = option('--browser-path');

if (!playwrightModule) {
  throw new Error('Usage: node scripts/capture-social-preview.mjs --playwright-module /path/to/playwright.mjs [--browser-path /path/to/chromium]');
}

const { chromium } = await import(pathToFileURL(resolve(playwrightModule)).href);
const browser = await chromium.launch({
  headless: true,
  ...(browserPath ? { executablePath: browserPath } : {}),
});

try {
  const page = await browser.newPage({
    viewport: { width: 700, height: 700 },
    deviceScaleFactor: 30 / 13,
  });
  await page.goto(pathToFileURL(resolve('demo/index.html')).href);
  await page.locator('.add-evidence[data-direction="for"]').first().waitFor();

  const firstRow = page.locator('#category-rows tr').first();
  for (const [direction, value] of [['for', '10'], ['against', '4']]) {
    await firstRow.locator(`input[data-direction="${direction}"]`).evaluate((input, nextValue) => {
      input.value = nextValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }
  await firstRow.locator('.add-evidence[data-direction="for"]').click();
  await firstRow.locator('.add-evidence[data-direction="for"]').click();
  await firstRow.locator('.add-evidence[data-direction="against"]').click();
  await page.locator('#prior-min-decibans').fill('-5');
  await page.locator('#prior-min-decibans').press('Enter');
  await page.locator('#prior-max-decibans').fill('7');
  await page.locator('#prior-max-decibans').press('Enter');
  await page.waitForFunction(() => document.querySelector('#cone')?.dataset.moveCount === '3');
  await page.waitForFunction(() => document.querySelector('#dissonance')?.textContent?.trim() === '33.3%');
  const detailsToggle = page.locator('#diagram-details-toggle');
  if (await detailsToggle.getAttribute('aria-expanded') !== 'true') await detailsToggle.click();

  await page.evaluate(() => {
    for (const selector of ['.introduction', '.settings', '.controls', '.explanation']) {
      const element = document.querySelector(selector);
      element.style.cssText = 'position:absolute;top:0;left:-10000px;visibility:hidden';
    }
    const main = document.querySelector('main');
    const workspace = document.querySelector('.workspace');
    const mainColumn = document.querySelector('.main-column');
    const result = document.querySelector('.result');
    main.style.cssText = 'width:520px;margin:0;padding:0';
    workspace.style.display = 'block';
    mainColumn.style.display = 'block';
    result.style.cssText = 'width:520px;height:auto;margin:0;padding:13px 2px;border-radius:0;box-shadow:none';
    window.dispatchEvent(new Event('resize'));
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    document.querySelector('.cone-wrap').classList.add('captions-stacked');
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await page.locator('.result').screenshot({ path: 'demo/social-preview.png' });
  const preview = await readFile('demo/social-preview.png');
  const [width, height] = [preview.readUInt32BE(16), preview.readUInt32BE(20)];
  if (width !== 1200 || height !== 630) {
    throw new Error(`Social preview must be 1200×630px, received ${width}×${height}px.`);
  }
} finally {
  await browser.close();
}
