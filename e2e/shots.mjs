// Screenshots into docs/. Usage: node e2e/shots.mjs http://localhost:3500
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const U = (process.argv[2] || 'http://localhost:3500').replace(/\/$/, '');
fs.mkdirSync('docs', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
async function page(w = 1280, h = 900) { const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 }); return p; }
async function login(p, pin, lang = 'en') {
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter');
  await p.waitForSelector('.top .nav', { timeout: 8000 }); await sleep(700);
}
const go = async (p, r) => { await p.evaluate((x) => (location.hash = '#/' + x), r); await sleep(700); };
const shot = async (p, name) => { await p.screenshot({ path: 'docs/' + name + '.png' }); console.log('shot', name); };
async function api(token, op) { const r = await fetch(U + '/api/data', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ op }) }); return r.json(); }
const token = (await (await fetch(U + '/api/data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: { type: 'login', pin: '1111' } }) })).json()).token;
await api(token, { type: 'reset' });
await api(token, { type: 'reset' });
let p = await page(); await p.goto(U, { waitUntil: 'networkidle0' }); await sleep(400); await shot(p, '01-login');
await login(p, '1111'); await shot(p, '02-dashboard');
await go(p, 'events'); await shot(p, '03-events');
await p.click('[data-act="ev-new"]'); await sleep(500); await shot(p, '04-new-event'); await p.keyboard.press('Escape'); await sleep(300);
await go(p, 'venues'); await shot(p, '05-venues');
await go(p, 'checklist'); await shot(p, '06-checklist');
await go(p, 'vendors'); await shot(p, '07-vendors');
await go(p, 'clients'); await shot(p, '08-clients');
await go(p, 'payments'); await shot(p, '09-payments');
await go(p, 'reports'); await sleep(600); await shot(p, '10-reports');
await go(p, 'audit'); await shot(p, '11-audit');
let pl = await page(); await login(pl, '2222'); await shot(pl, '12-planner-dashboard');
let fn = await page(); await login(fn, '3333'); await go(fn, 'payments'); await shot(fn, '13-finance-payments');
let co = await page(); await login(co, '4444'); await go(co, 'checklist'); await shot(co, '14-coordinator-checklist');
let vn = await page(); await login(vn, '5555'); await shot(vn, '15-vendor-dashboard');
let a = await page(); await login(a, '1111', 'ar'); await shot(a, '16-arabic-dashboard');
await go(a, 'events'); await shot(a, '17-arabic-events');
let ph = await page(390, 844); await login(ph, '2222'); await shot(ph, '18-phone-dashboard');
await go(ph, 'events'); await shot(ph, '19-phone-events');
let lph = await page(390, 844); await login(lph, '5555'); await shot(lph, '20-phone-vendor');
let aph = await page(390, 844); await login(aph, '1111', 'ar'); await shot(aph, '21-phone-arabic');
await api(token, { type: 'reset' });
await b.close(); console.log('done');
