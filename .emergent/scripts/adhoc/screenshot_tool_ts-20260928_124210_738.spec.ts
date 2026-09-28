import { test, expect } from '@playwright/test';

test('screenshot', async ({ page }) => {
  const errs:string[]=[];
page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
page.on('response',r=>{if(r.status()>=400)errs.push(`${r.status()} ${r.url()}`)});
await page.setViewportSize({width:1280,height:800});
await page.goto('/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1200);
await page.getByText('Quick unlock',{exact:false}).click({force:true});
await page.waitForTimeout(3500);
console.log('URL',page.url());
console.log('DASH',(await page.locator('body').innerText()).slice(0,400));
await page.screenshot({path:'dash.png',type:'jpeg'});
await page.goto('/pyq',{waitUntil:'domcontentloaded'});await page.waitForTimeout(2500);
console.log('PYQ',(await page.locator('body').innerText()).slice(0,250));
await page.screenshot({path:'pyq.png',type:'jpeg'});
await page.goto('/weakness',{waitUntil:'domcontentloaded'});await page.waitForTimeout(2000);
console.log('WEAK',(await page.locator('body').innerText()).slice(0,200));
await page.screenshot({path:'weak.png',type:'jpeg'});
console.log('ERRS',JSON.stringify(errs.slice(0,10)));
});
