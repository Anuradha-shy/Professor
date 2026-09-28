import { test, expect } from '@playwright/test';

test('screenshot', async ({ page }) => {
  const errs:string[]=[];
page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
page.on('response',r=>{if(r.status()>=400)errs.push(`${r.status()} ${r.url()}`)});
await page.setViewportSize({width:1280,height:900});
await page.goto('/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1200);
await page.getByTestId('login-password-input').fill('ican');
await page.getByTestId('login-submit-button').click({force:true});
await page.waitForTimeout(3000);
console.log('DASH',(await page.locator('body').innerText()).replace(/\n+/g,' | ').slice(0,700));
await page.screenshot({path:'dash.png',type:'jpeg'});

// PYQ: pick a year, open a question
await page.goto('/pyq',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(2000);
await page.getByTestId('pyq-year-select').click({force:true});
await page.waitForTimeout(700);
await page.getByRole('option',{name:/^2024/}).click({force:true});
await page.waitForTimeout(2500);
const first=page.locator('[data-testid^="pyq-open-"]').first();
await first.click({force:true});
await page.waitForTimeout(2000);
console.log('PYQ DETAIL',(await page.getByTestId('pyq-detail-dialog').innerText()).replace(/\n+/g,' | ').slice(0,400));
await page.screenshot({path:'pyqdetail.png',type:'jpeg'});
await page.keyboard.press('Escape');

// Notion: read + tick
await page.goto('/notion',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(3000);
await page.locator('[data-testid^="notion-read-open-"]').first().click({force:true});
await page.waitForTimeout(2000);
console.log('READER',(await page.getByTestId('notion-reader').innerText()).replace(/\n+/g,' | ').slice(0,400));
await page.screenshot({path:'reader.png',type:'jpeg'});
console.log('TICK',await page.getByTestId('notion-reader-read-tick').innerText());
console.log('ERRS',JSON.stringify(errs.slice(0,8)));
});
