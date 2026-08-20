/*
 * Fill every form on the project and check it says something back.
 *
 *   node tools/forms.mjs
 *
 * Three of the six demos ask the visitor for something. All three have been
 * screenshotted empty and none had ever been submitted — an empty form looks
 * identical whether its validation works or throws.
 */
import { chromium } from '@playwright/test';

const CASES = [
  { path: '/demos/noise94/',  form: '#alertForm', field: '#alertPhone',
    bad: 'nope', good: '+44 7700 900123', ok: '#alertOk', err: '#alertErr' },
  { path: '/demos/cendre/',   form: '#bookForm',  field: '[name=name]',
    bad: '   ', good: 'M. Ravn', ok: '#bookOk', err: '#bookErr' },
  { path: '/demos/mossfoot/', form: '#joinForm',  field: '#joinEmail',
    bad: 'not-an-email', good: 'lumen@bramblehollow.net', ok: '#joinOk', err: '#joinErr' },
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 110)));
  await page.goto('http://127.0.0.1:4173' + c.path, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const state = async () => page.evaluate(([o, e]) => {
    const g = (s) => { const el = document.querySelector(s); return el && !el.hidden
      ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70) : null; };
    return { ok: g(o), err: g(e) };
  }, [c.ok, c.err]);

  await page.locator(c.field).scrollIntoViewIfNeeded();
  await page.locator(c.field).fill(c.bad);
  await page.locator(`${c.form} [type=submit], ${c.form} button`).first().click();
  await page.waitForTimeout(500);
  const afterBad = await state();

  await page.locator(c.field).fill(c.good);
  await page.locator(`${c.form} [type=submit], ${c.form} button`).first().click();
  await page.waitForTimeout(600);
  const afterGood = await state();

  const rejects = !!afterBad.err && !afterBad.ok;
  const accepts = !!afterGood.ok && !afterGood.err;
  console.log(`   ${rejects && accepts && !errs.length ? '✓' : '✗'} ${c.path}`);
  console.log(`       bad  → ${afterBad.err ? 'err: ' + afterBad.err : afterBad.ok ? 'ACCEPTED IT: ' + afterBad.ok : 'SILENT'}`);
  console.log(`       good → ${afterGood.ok ? 'ok: ' + afterGood.ok : afterGood.err ? 'REJECTED IT: ' + afterGood.err : 'SILENT'}`);
  if (errs.length) console.log(`       JS ERROR ${errs[0]}`);
  await page.close();
}
await browser.close();
