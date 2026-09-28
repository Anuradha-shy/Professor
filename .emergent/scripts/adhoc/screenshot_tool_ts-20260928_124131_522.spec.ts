import { test, expect } from '@playwright/test';

test('screenshot', async ({ page }) => {
  const errs:string[]=[];
page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
page.on('response',r=>{if(r.status()>=400)errs.push(`${r.status()} ${r.url()}`)});
await page.setViewportSize({width:1280,height:800});
await page.goto('/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1500);
const pin=page.locator('input').first();
if(await pin.count()){await pin.fill('1947');await page.keyboard.press('Enter');}
await page.waitForTimeout(3000);
console.log('URL',page.url());
console.log('BODY',(await page.locator('body').innerText()).slice(0,300));
await page.screenshot({path:'dash.png',type:'jpeg',fullPage:false});
await page.goto('/pyq',{waitUntil:'domcontentloaded'});await page.waitForTimeout(2500);
await page.screenshot({path:'pyq.png',type:'jpeg',fullPage:false});
console.log('PYQ',(await page.locator('body').innerText()).slice(0,200));
console.log('ERRS',JSON.stringify(errs));
});
