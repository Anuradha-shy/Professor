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
console.log('DASH',(await page.locator('body').innerText()).replace(/\n+/g,' | ').slice(0,500));
await page.screenshot({path:'dash.png',type:'jpeg'});
await page.goto('/pyq?x=1',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(2500);
await page.getByTestId('pyq-year-select').click({force:true});
await page.waitForTimeout(800);
await page.getByRole('option',{name:/^2024/}).click({force:true});
await page.waitForTimeout(2500);
await page.locator('[data-testid^="pyq-open-"]').first().click({force:true});
await page.waitForTimeout(2000);
console.log('PYQ',(await page.getByTestId('pyq-detail-dialog').innerText()).replace(/\n+/g,' | ').slice(0,350));
await page.screenshot({path:'pyq.png',type:'jpeg'});
console.log('ERRS',JSON.stringify(errs.slice(0,6)));
});
