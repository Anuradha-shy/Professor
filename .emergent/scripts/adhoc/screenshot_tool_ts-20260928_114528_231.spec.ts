import { test, expect } from '@playwright/test';

test('screenshot', async ({ page }) => {
  const errors: string[] = [];
const bad: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });

const BASE = 'https://learning-analytics-22.preview.emergentagent.com';

// --- DESKTOP happy path through the public URL ---
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="pin-gate-card"]', { timeout: 30000 });
await page.click('[data-testid="pin-demo-button"]', { force: true });
await page.waitForSelector('[data-testid="nav-dashboard"]', { timeout: 30000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: 'pub-dashboard.jpeg', quality: 20, type: 'jpeg', fullPage: false });

// create data through the UI
await page.click('[data-testid="quick-log-session-btn"]', { force: true });
await page.waitForSelector('[data-testid="session-form"]', { timeout: 15000 });
await page.click('[data-testid="session-subject-select"]', { force: true });
await page.waitForTimeout(600);
await page.locator('[role="option"]').first().click({ force: true });
await page.fill('[data-testid="session-topic-input"]', 'Public-URL smoke: Ethics case studies');
await page.click('[data-testid="session-minutes-90"]', { force: true });
await page.click('[data-testid="session-save-button"]', { force: true });
await page.waitForTimeout(1200);

// verify it landed in the study log
await page.click('[data-testid="nav-sessions"]', { force: true });
await page.waitForSelector('[data-testid="sessions-table"]', { timeout: 20000 });
const found = await page.getByText('Public-URL smoke: Ethics case studies', { exact: true }).count();
console.log('new session visible in log:', found > 0);
await page.screenshot({ path: 'pub-sessions.jpeg', quality: 20, type: 'jpeg', fullPage: false });

// goals: bump progress
await page.click('[data-testid="nav-goals"]', { force: true });
await page.waitForTimeout(1200);
const plus = page.locator('[data-testid^="goal-plus-"]').first();
if (await plus.count()) { await plus.click({ force: true }); await page.waitForTimeout(800); }
await page.screenshot({ path: 'pub-goals.jpeg', quality: 20, type: 'jpeg', fullPage: false });

// subjects: toggle a syllabus topic
await page.click('[data-testid="nav-subjects"]', { force: true });
await page.waitForSelector('[data-testid="overall-progress-card"]', { timeout: 20000 });
const exp = page.locator('[data-testid^="subject-expand-"]').first();
await exp.click({ force: true });
await page.waitForTimeout(700);
const chk = page.locator('[data-testid^="topic-check-"]').last();
if (await chk.count()) { await chk.click({ force: true }); await page.waitForTimeout(900); }
await page.screenshot({ path: 'pub-subjects.jpeg', quality: 20, type: 'jpeg', fullPage: false });

// tests page
await page.click('[data-testid="nav-tests"]', { force: true });
await page.waitForSelector('[data-testid="tests-table"]', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'pub-tests.jpeg', quality: 20, type: 'jpeg', fullPage: false });

// notion sync: run a sync through the public path
await page.click('[data-testid="nav-settings"]', { force: true });
await page.waitForSelector('[data-testid="notion-hub-card"]', { timeout: 20000 });
await page.click('[data-testid="notion-sync-now-btn"]', { force: true });
await page.waitForTimeout(1800);
await page.screenshot({ path: 'pub-settings-sync.jpeg', quality: 20, type: 'jpeg', fullPage: false });

// --- MOBILE viewport check ---
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="today-progress-card"]', { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'pub-mobile-dashboard.jpeg', quality: 20, type: 'jpeg', fullPage: false });
await page.click('[data-testid="mobile-menu-button"]', { force: true });
await page.waitForTimeout(700);
await page.screenshot({ path: 'pub-mobile-nav.jpeg', quality: 20, type: 'jpeg', fullPage: false });

console.log('console errors:', errors.length ? errors : 'none');
console.log('responses >=400:', bad.length ? bad : 'none');
});
