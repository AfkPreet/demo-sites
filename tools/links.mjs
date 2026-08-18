/*
 * Link and anchor check across every page.
 *
 *   node tools/links.mjs
 *
 * Every internal href must resolve to a real page, and every #fragment must
 * point at an element that exists on the page carrying the link. One broken
 * link on a portfolio is worse than a slow one.
 */

import { chromium } from '@playwright/test';

const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4173';
const PAGES = [
  '/',
  '/demos/aurelis/',
  '/demos/aetherion/',
  '/demos/noise94/',
  '/demos/cendre/',
  '/demos/mossfoot/',
  '/demos/volume-zero/',
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const seen = new Map();
const check = async (url) => {
  if (seen.has(url)) return seen.get(url);
  const r = await page.request.get(url);
  seen.set(url, r.status());
  return r.status();
};

let bad = 0;

for (const path of PAGES) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      href: a.getAttribute('href'),
      text: (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    }))
  );

  const issues = [];
  for (const { href, text } of links) {
    if (href.startsWith('#')) {
      const id = href.slice(1);
      const ok = await page.evaluate((i) => !!document.getElementById(i), id);
      if (!ok) issues.push(`missing anchor ${href} ("${text}")`);
    } else if (href.startsWith('/')) {
      const status = await check(BASE + href);
      if (status >= 400) issues.push(`HTTP ${status} → ${href} ("${text}")`);
    } else if (/^https?:/.test(href)) {
      issues.push(`external link ${href} ("${text}")`);
    }
  }

  // Focusable controls need an accessible name.
  const nameless = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a, button, input, select, textarea'))
      .filter((el) => {
        if (el.closest('[aria-hidden="true"]')) return false;
        const name =
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          (el.labels && el.labels.length) ||
          el.innerText?.trim();
        return !name;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`)
      .slice(0, 5)
  );
  for (const n of nameless) issues.push(`no accessible name: ${n}`);

  bad += issues.length;
  console.log(`${issues.length ? '✗' : '✓'} ${path.padEnd(22)} ${links.length} links` +
    (issues.length ? `\n    ${issues.join('\n    ')}` : ''));
}

await browser.close();
console.log(bad ? `\n${bad} issue(s)` : '\nall links and anchors resolve');
process.exit(bad ? 1 : 0);
