import { test, expect } from '@playwright/test';

test('screenshot', async ({ page }) => {
  const errors: string[] = [];
const bad: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/auth/me')) bad.push(`${r.status()} ${r.url()}`); });
const BASE = 'https://learning-analytics-22.preview.emergentagent.com';

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="pin-gate-card"]', { timeout: 30000 });
await page.click('[data-testid="pin-demo-button"]', { force: true });
await page.waitForSelector('[data-testid="prelims-countdown"]', { timeout: 40000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: 'v2-dashboard.jpeg', quality: 22, type: 'jpeg', fullPage: false });

// live timer
await page.click('[data-testid="timer-subject-select"]', { force: true });
await page.waitForTimeout(600);
await page.locator('[role="option"]').first().click({ force: true });
await page.fill('[data-testid="timer-topic-input"]', 'Timer check: Polity');
await page.click('[data-testid="timer-start-btn"]', { force: true });
await page.waitForTimeout(2500);
console.log('timer:', await page.locator('[data-testid="timer-display"]').textContent());
await page.click('[data-testid="timer-pause-btn"]', { force: true });

// PYQ
await page.goto(`${BASE}/pyq`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="pyq-year-select"]', { timeout: 20000 });
await page.click('[data-testid="pyq-year-select"]', { force: true });
await page.waitForTimeout(700);
await page.locator('[role="option"]').first().click({ force: true });
await page.waitForSelector('[data-testid="pyq-question-list"]', { timeout: 20000 });
const opts = page.locator('[data-testid^="pyq-opt-"]');
for (let i = 0; i < 6; i++) await opts.nth(i * 4).click({ force: true });
await page.screenshot({ path: 'v2-pyq.jpeg', quality: 22, type: 'jpeg', fullPage: false });
await page.click('[data-testid="pyq-submit-btn"]', { force: true });
await page.waitForSelector('[data-testid="pyq-result-card"]', { timeout: 25000 });
console.log('pyq scored ok');

// weakness
await page.goto(`${BASE}/weakness`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="weakness-list"]', { timeout: 25000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'v2-weakness.jpeg', quality: 22, type: 'jpeg', fullPage: false });
const q = page.locator('[data-testid^="weakness-queue-"]').first();
if (await q.count()) { await q.click({ force: true }); await page.waitForTimeout(1200); console.log('queued weak topic'); }

// notion
await page.goto(`${BASE}/notion`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="notion-entry-grid"]', { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'v2-notion.jpeg', quality: 22, type: 'jpeg', fullPage: false });
const img = page.locator('[data-testid^="notion-image-"]').first();
if (await img.count()) {
  await img.click({ force: true });
  await page.waitForSelector('[data-testid="notion-lightbox"]', { timeout: 10000 });
  await page.click('[data-testid="lightbox-zoom-in"]', { force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'v2-lightbox.jpeg', quality: 22, type: 'jpeg', fullPage: false });
  await page.click('[data-testid="lightbox-close"]', { force: true });
  console.log('lightbox ok');
}

// professor AI
await page.goto(`${BASE}/professor`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="ai-input"]', { timeout: 20000 });
await page.fill('[data-testid="ai-input"]', 'In one line: my single biggest risk for Prelims 2027?');
await page.click('[data-testid="ai-send-btn"]', { force: true });
await page.waitForSelector('[data-testid="ai-msg-assistant"]', { timeout: 150000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'v2-professor.jpeg', quality: 22, type: 'jpeg', fullPage: false });
console.log('AI:', await page.locator('[data-testid="ai-msg-assistant"]').first().innerText().then(s => s.slice(0, 160)));

// settings
await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="devices-list"]', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'v2-settings.jpeg', quality: 22, type: 'jpeg', fullPage: false });

// mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="prelims-countdown"]', { timeout: 25000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'v2-mobile.jpeg', quality: 22, type: 'jpeg', fullPage: false });

console.log('console errors:', errors.length ? errors.slice(0, 5) : 'none');
console.log('responses >=400:', bad.length ? bad.slice(0, 5) : 'none');
});
