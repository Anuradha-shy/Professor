import { test, expect } from '@playwright/test';

test('screenshot', async ({ page }) => {
  const errs:string[]=[];
page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
page.on('response',r=>{if(r.status()>=400)errs.push(`${r.status()} ${r.url()}`)});
await page.setViewportSize({width:1280,height:800});
await page.goto('/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1200);
await page.getByTestId('login-password-input').fill('ican');
await page.getByTestId('login-submit-button').click({force:true});
await page.waitForTimeout(3500);
console.log('URL',page.url());
console.log('DASH',(await page.locator('body').innerText()).slice(0,250));
await page.screenshot({path:'dash.png',type:'jpeg'});
await page.goto('/notion',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(3500);
console.log('NOTION',(await page.locator('body').innerText()).slice(0,600));
await page.screenshot({path:'notion.png',type:'jpeg'});
console.log('ERRS',JSON.stringify(errs.slice(0,8)));
});
