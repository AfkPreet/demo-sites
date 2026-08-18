import { chromium } from '@playwright/test';
const url = process.argv[2] ?? '/demos/aurelis/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
const p = await b.newPage({ viewport:{width:1440,height:900} });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
p.on('console', m => { if (m.type()==='error') console.log('CONSOLE-ERR', m.text().slice(0,160)); });
await p.goto('http://127.0.0.1:4173'+url, { waitUntil:'load' });
await p.waitForTimeout(2500);
console.log(await p.evaluate(() => ({
  scrollY: window.scrollY,
  heroH: document.querySelector('.hero')?.offsetHeight,
  innerH: innerHeight,
  docH: document.documentElement.scrollHeight,
  dbg: window.__aurelis ?? 'no debug hook',
})));
await b.close();
