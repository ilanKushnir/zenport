#!/usr/bin/env node
/**
 * Browser QA sweep against a running ZenPort server.
 *
 * Usage:
 *   node scripts/qa-browser.mjs [baseUrl] [username] [password]
 * Defaults: http://127.0.0.1:8484 astra astra-demo-password-1
 *
 * Environment:
 *   ZP_QA_OUT      output directory (default qa-output/ next to the repo)
 *   ZP_QA_BROWSER  explicit Chromium executable path (else Playwright's)
 *
 * Captures screenshots at desktop (1440), tablet (834), phone (390), and
 * narrow (320) widths, logs console/page errors, checks horizontal
 * overflow, and walks the core flows: setup/login, library + filters,
 * meditation detail + documents, player + focus mode + wake-lock state,
 * planner, stats (empty and populated), journal, YouTube sources, and the
 * Coming Soon integrations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = createRequire('/usr/local/lib/node_modules/')('playwright'));
}

const BASE = process.argv[2] ?? 'http://127.0.0.1:8484';
const USER = process.argv[3] ?? 'astra';
const PASS = process.argv[4] ?? 'astra-demo-password-1';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.ZP_QA_OUT ?? path.join(here, '..', 'qa-output');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const issues = [];
function note(kind, msg) {
  issues.push({ kind, msg });
  console.log(`  [${kind}] ${msg}`);
}

const WIDTHS = [
  ['desktop', 1440, 900],
  ['tablet', 834, 1112],
  ['phone', 390, 844],
  ['narrow', 320, 700],
];

async function settle(page, ms = 250) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  console.log(`  shot ${name}`);
}

async function checkOverflow(page, name) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(doc.scrollWidth - doc.clientWidth, document.body.scrollWidth - doc.clientWidth);
  });
  if (overflow > 1) note('overflow', `${name}: horizontal overflow of ${overflow}px`);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.ZP_QA_BROWSER || undefined,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  let authed = false;
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // Before setup/login the app probes /api/auth/me and receives an
    // expected 401, which Chromium logs as a resource error. Ignore only
    // that, only pre-auth.
    if (!authed && /401/.test(msg.text())) return;
    note('console', msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => note('pageerror', String(err).slice(0, 300)));

  // --- Setup or login ---
  await page.goto(BASE);
  await settle(page);
  const needsSetup = await page
    .getByLabel('Password (10+ characters)')
    .isVisible()
    .catch(() => false);
  if (needsSetup) {
    await shot(page, '00-setup');
    await page.getByLabel('Username').fill(USER);
    await page.getByLabel('Password (10+ characters)').fill(PASS);
    await page.getByRole('button', { name: 'Create admin account' }).click();
  } else {
    await shot(page, '00-login');
    await page.getByLabel('Username').fill(USER);
    await page.getByLabel('Password', { exact: true }).fill(PASS);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await page.waitForSelector('h1:has-text("Library")', { timeout: 15000 });
  authed = true;
  await settle(page, 600);

  // --- Stats empty state first (before any practice) ---
  await page.goto(`${BASE}/stats`);
  await settle(page);
  await shot(page, '01-stats-empty');

  // --- Library across widths ---
  await page.goto(BASE);
  await settle(page, 600);
  for (const [label, w, h] of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await settle(page, 300);
    await shot(page, `02-library-${label}`);
    await checkOverflow(page, `library-${label}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // --- Filtering ---
  await page.getByLabel('Search the library').fill('morning');
  await settle(page, 300);
  await shot(page, '03-library-filtered');
  const cards = await page.locator('.med-card .t').allTextContents();
  if (!cards.some((t) => /morning/i.test(t))) note('flow', 'search did not surface Morning Ritual');
  await page.getByLabel('Search the library').fill('zzzznothing');
  await settle(page, 300);
  await shot(page, '03b-library-noresults');
  const hasReset = await page.getByRole('button', { name: 'Reset filters' }).isVisible();
  if (!hasReset) note('flow', 'no-results state missing reset button');
  await page.getByRole('button', { name: 'Reset filters' }).click();

  // --- Creator page ---
  await page.locator('.med-card', { hasText: 'Mira Solen' }).first().click();
  await settle(page);
  await shot(page, '04-creator');

  // --- Detail page ---
  await page.locator('.med-card', { hasText: 'Morning Ritual' }).first().click();
  await settle(page);
  await shot(page, '05-detail');
  await checkOverflow(page, 'detail');
  // Evidence sheet
  await page.getByRole('button', { name: 'Why ZenPort read it this way' }).click();
  await settle(page, 300);
  await shot(page, '05b-evidence');
  await page.keyboard.press('Escape');
  // Document reader
  await page.getByRole('button', { name: 'Read' }).first().click();
  await settle(page, 300);
  await shot(page, '05c-doc-reader');
  await page.keyboard.press('Escape');

  // --- Player ---
  await page.getByRole('button', { name: 'Begin practice' }).click();
  await page.waitForSelector('.player-bar', { timeout: 10000 });
  await settle(page, 800);
  await shot(page, '06-player-bar');
  // Focus mode + wake lock
  await page.getByRole('button', { name: 'Enter focus mode' }).click();
  await settle(page, 500);
  await shot(page, '06b-focus-mode');
  const wakeBtn = page
    .locator('.focus-mode')
    .getByRole('button', { name: /screen awake|screen sleep/i });
  if (await wakeBtn.isVisible()) {
    await wakeBtn.click();
    await settle(page, 300);
    await shot(page, '06c-focus-wakelock');
  } else {
    note('flow', 'wake lock toggle not found in focus mode');
  }
  await page.getByRole('button', { name: 'Leave focus mode' }).click();
  await settle(page, 300);
  // End practice -> reflection sheet
  await page.getByRole('button', { name: 'End practice' }).click();
  await page.waitForSelector('text=A moment of reflection', { timeout: 10000 });
  await shot(page, '07-reflection');
  await page.getByLabel('What surfaced?').fill('QA sweep: felt appropriately calm.');
  await page.getByRole('button', { name: /Settled \(4 of 5\)/ }).click();
  await page.getByRole('button', { name: 'Keep this reflection' }).click();
  await settle(page, 500);

  // --- Journal ---
  await page.goto(`${BASE}/journal`);
  await settle(page);
  await shot(page, '08-journal');
  const entryVisible = await page.locator('.journal-entry').first().isVisible();
  if (!entryVisible) note('flow', 'reflection did not appear in journal');

  // --- Plans ---
  await page.goto(`${BASE}/plans`);
  await settle(page);
  await shot(page, '09-plans-empty');
  await page.getByRole('button', { name: 'New plan' }).first().click();
  await settle(page, 300);
  await page.getByLabel('Name').fill('Morning sits');
  await page
    .getByLabel('Intention (shows during focused practice)')
    .fill('Arrive before the day does');
  await shot(page, '09b-plan-sheet');
  await page.getByRole('button', { name: 'Create plan' }).click();
  await settle(page, 500);
  await shot(page, '09c-plans-timeline');
  const doneBtn = page.getByRole('button', { name: 'Done' }).first();
  if (await doneBtn.isVisible()) {
    await doneBtn.click();
    await settle(page, 400);
    await shot(page, '09d-plans-completed');
  }
  for (const [label, w, h] of WIDTHS.slice(2)) {
    await page.setViewportSize({ width: w, height: h });
    await settle(page, 300);
    await checkOverflow(page, `plans-${label}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // --- Stats populated ---
  await page.goto(`${BASE}/stats`);
  await settle(page);
  await shot(page, '10-stats');
  await page.getByRole('tab', { name: 'History' }).click();
  await settle(page, 300);
  await shot(page, '10b-history');

  // --- YouTube sources ---
  await page.goto(`${BASE}/sources`);
  await settle(page);
  await shot(page, '11-sources-empty');
  await page.getByRole('button', { name: 'Add source' }).first().click();
  await page.getByLabel('Video, playlist, or channel URL').fill('https://vimeo.com/12345');
  await page.getByRole('button', { name: 'Check' }).click();
  await settle(page, 300);
  const rejected = await page.locator('text=Only YouTube links').isVisible();
  if (!rejected) note('flow', 'non-YouTube URL was not rejected visibly');
  await shot(page, '11b-sources-rejected');
  await page
    .getByLabel('Video, playlist, or channel URL')
    .fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Check' }).click();
  await settle(page, 1200); // may hit oEmbed or fall back to manual title
  const titleField = page.locator('#ys-title');
  if (await titleField.isVisible()) {
    if ((await titleField.inputValue()) === '') {
      await titleField.fill('Manually titled meditation video');
    }
    await shot(page, '11c-sources-form');
    await page.getByRole('button', { name: 'Save source' }).click();
    await settle(page, 500);
    await shot(page, '11d-sources-saved');
  } else {
    note('flow', 'video form did not appear (offline oEmbed path?)');
    await page.keyboard.press('Escape');
  }

  // --- Integrations / Coming Soon ---
  await page.goto(`${BASE}/integrations`);
  await settle(page);
  await shot(page, '12-integrations');
  const ubal = await page.locator('.integration-card', { hasText: 'UBAL' }).isVisible();
  const metube = await page.locator('.integration-card', { hasText: 'MeTube' }).isVisible();
  if (!ubal || !metube) note('flow', 'Coming Soon cards missing');
  await checkOverflow(page, 'integrations');

  // --- Settings ---
  await page.goto(`${BASE}/settings`);
  await settle(page);
  await shot(page, '13-settings');

  // --- Mobile pass over key pages ---
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, url] of [
    ['journal', '/journal'],
    ['stats', '/stats'],
    ['sources', '/sources'],
    ['integrations', '/integrations'],
    ['settings', '/settings'],
  ]) {
    await page.goto(`${BASE}${url}`);
    await settle(page, 300);
    await shot(page, `14-phone-${name}`);
    await checkOverflow(page, `phone-${name}`);
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(BASE);
  await settle(page, 400);
  await shot(page, '15-narrow-library');
  await checkOverflow(page, 'narrow-library');

  await browser.close();

  console.log('\n=== QA summary ===');
  if (issues.length === 0) {
    console.log('clean: no console errors, no overflow, all flows passed');
  } else {
    for (const i of issues) console.log(`[${i.kind}] ${i.msg}`);
  }
  fs.writeFileSync(
    path.join(outDir, 'summary.json'),
    JSON.stringify({ base: BASE, at: new Date().toISOString(), issues }, null, 2),
  );
  process.exit(issues.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
