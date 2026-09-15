/**
 * End-to-end smoke test: walks the persona path from the PRD (Pulse → Board → a stalled card →
 * the Catalyst) against a built app, fails on any console error, and leaves screenshots behind.
 *
 * Usage:  npm run build && npm run preview &   then   npm run smoke
 * Env:    MPP_URL (default http://localhost:4173), MPP_CHROMIUM (path to a chromium binary),
 *         MPP_SHOTS (screenshot directory, default ./.smoke)
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.env.MPP_URL ?? 'http://localhost:4173';
const shots = process.env.MPP_SHOTS ?? '.smoke';
const executablePath = process.env.MPP_CHROMIUM;

await mkdir(shots, { recursive: true });

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

const errors = [];
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Team Pulse', { timeout: 15_000 });
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: `${shots}/01-pulse.png`, fullPage: true });

  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/02-board.png` });

  // The red card from the walkthrough, and the way out of it.
  await page.getByText('Rewrite Q3 report').first().click();
  await page.waitForSelector('text=Break it down', { timeout: 5_000 });
  await page.screenshot({ path: `${shots}/03-drawer.png` });

  await page.getByRole('button', { name: 'Break it down' }).click();
  await page.getByRole('button', { name: 'Just Start' }).first().click();
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: `${shots}/04-catalyst.png` });

  // Starting the Catalyst counts as movement, so the card must no longer read as stalled.
  await page.getByRole('button', { name: 'Close' }).last().click(); // the Catalyst modal
  await page.getByRole('button', { name: 'Close' }).first().click(); // the card drawer
  await page.waitForTimeout(400);
  const stalled = await page.getByText('Stalled · 5d').count();
  if (stalled > 0) throw new Error('Catalyst activity did not clear the stagnation flag');

  // Flag visibility is the decision the whole peer-accountability mechanic rests on, so assert
  // it actually redacts rather than merely styling things differently.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('label').filter({ hasText: 'Only the assignee sees the flag' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/05-settings.png`, fullPage: true });

  await page.getByLabel('Viewing as').selectOption({ label: 'Priya Nair' });
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.waitForTimeout(500);
  const visibleToPeer = await page.getByText(/Stalled ·/).count();
  if (visibleToPeer > 0) {
    throw new Error(`Owner-only visibility leaked ${visibleToPeer} flag(s) to a teammate`);
  }
  // Even the header count is attribution a teammate should not have at this level.
  const badge = await page.getByRole('button', { name: /Team Pulse \d/ }).count();
  if (badge > 0) throw new Error('Owner-only visibility leaked a red-flag count to a teammate');
  await page.screenshot({ path: `${shots}/06-owner-only.png` });

  // Put the team back on the default before finishing.
  await page.getByLabel('Viewing as').selectOption({ label: 'Amina Okoye (lead)' });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('label').filter({ hasText: 'Everyone on the team sees the flag' }).click();
  await page.waitForTimeout(300);
} finally {
  await browser.close();
}

if (errors.length > 0) {
  console.error('Console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`Smoke test passed. Screenshots in ${shots}/`);
