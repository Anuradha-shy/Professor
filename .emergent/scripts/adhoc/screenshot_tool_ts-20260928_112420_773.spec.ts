import { test, expect } from '@playwright/test';

test('screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="pin-gate-card"]', { timeout: 20000 });
await page.screenshot({ path: 'login.jpeg', quality: 20, type: 'jpeg', fullPage: false });
// unlock with the one-click demo PIN
await page.click('[data-testid="pin-demo-button"]', { force: true });
await page.waitForSelector('[data-testid="nav-dashboard"]', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'dashboard.jpeg', quality: 20, type: 'jpeg', fullPage: false });
// quick-log a session through the header dialog (real data creation)
await page.click('[data-testid="quick-log-session-btn"]', { force: true });
await page.waitForSelector('[data-testid="session-form"]', { timeout: 10000 });
await page.click('[data-testid="session-subject-select"]', { force: true });
await page.waitForTimeout(500);
await page.locator('[role="option"]').first().click({ force: true });
await page.fill('[data-testid="session-topic-input"]', 'Browser smoke: Polity revision');
await page.click('[data-testid="session-save-button"]', { force: true });
await page.waitForTimeout(900);
// revision queue: mark first due topic as recalled
await page.goto('http://localhost:3000/revisions', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="revisions-list"]', { timeout: 20000 });
await page.waitForTimeout(600);
await page.screenshot({ path: 'revisions.jpeg', quality: 20, type: 'jpeg', fullPage: false });
const firstEasy = page.locator('[data-testid^="revision-easy-"]').first();
if (await firstEasy.count()) { await firstEasy.click({ force: true }); await page.waitForTimeout(900); }
// settings: notion hub + test connection
await page.goto('http://localhost:3000/settings', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="notion-hub-card"]', { timeout: 20000 });
await page.click('[data-testid="notion-test-connection-btn"]', { force: true });
await page.waitForTimeout(900);
await page.screenshot({ path: 'settings.jpeg', quality: 20, type: 'jpeg', fullPage: false });
// insights charts
await page.goto('http://localhost:3000/insights', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'insights.jpeg', quality: 20, type: 'jpeg', fullPage: false });
console.log('happy-path pass complete');
});
