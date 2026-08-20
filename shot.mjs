import { chromium } from '@playwright/test';
const W = Number(process.env.W || 768), H = Number(process.env.H || 900);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await p.goto('http://127.0.0.1:4173' + (process.env.PATH_ || '/'), { waitUntil: 'load' });
await p.waitForTimeout(2500);
if (process.env.SEL) await p.locator(process.env.SEL).screenshot({ path: process.env.OUT });
else await p.screenshot({ path: process.env.OUT });
await b.close();
