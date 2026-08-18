import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://127.0.0.1:4173/demos/aurelis/?debug', { waitUntil:'load' });
await p.waitForTimeout(1500);
console.log('fresh at top :', await p.evaluate(() => window.__aurelis));

await p.evaluate(async () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  const steps = Math.max(40, Math.ceil(max / (innerHeight * 0.45)));
  for (let i = 0; i <= steps; i++) {
    window.scrollTo({ top: (max*i)/steps, behavior:'instant' });
    await new Promise(r => setTimeout(r, 70));
  }
  await new Promise(r => setTimeout(r, 400));
});
console.log('after pass   :', await p.evaluate(() => ({ y: window.scrollY, ...window.__aurelis })));

await p.evaluate(() => window.scrollTo({ top: 0, behavior:'instant' }));
await p.waitForTimeout(1800);
console.log('back at top  :', await p.evaluate(() => ({ y: window.scrollY, ...window.__aurelis })));
await p.screenshot({ path:'/tmp/claude-0/-home-user-demo-sites/c70a4c81-afbd-5475-885f-b79437b8705f/scratchpad/shots/after-pass.png' });
await b.close();
