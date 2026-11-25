// Browser and API checks against a running Farah (local dev server or the live URL).
// Usage: node e2e/e2e.mjs http://localhost:3500   (needs Chrome at /usr/bin/google-chrome)
import puppeteer from 'puppeteer-core';
import * as L from '../public/logic.js';
const U = (process.argv[2] || 'http://localhost:3500').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', m); };
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
const errs = [];
async function newPage(w = 1280, h = 900) {
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function login(p, pin, lang = 'en') {
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear()); await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter'); await p.waitForSelector('.top .nav', { timeout: 15000 }); await sleep(400);
}
const go = async (p, r) => { await p.evaluate((r) => (location.hash = '#/' + r), r); await sleep(450); };
const body = async (p) => { for (let i = 0; i < 4; i++) { try { return await p.evaluate(() => document.body.innerText); } catch { await sleep(600); } } return ''; };
const bare = /undefined|NaN|\[object/;
async function api(token, method, bodyObj, raw) {
  const r = await fetch(U + '/api/data', { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: raw ?? (bodyObj ? JSON.stringify(bodyObj) : undefined) });
  let j = null; try { j = await r.json(); } catch {} return { status: r.status, j };
}
const tokenFor = async (pin) => (await api(null, 'POST', { op: { type: 'login', pin } })).j.token;
const T = { manager: await tokenFor('1111'), planner: await tokenFor('2222'), finance: await tokenFor('3333'), coord: await tokenFor('4444'), vendor: await tokenFor('5555') };
const post = (role, op) => api(T[role], 'POST', { op });
const view = async (role) => (await api(T[role], 'GET')).j;
await post('manager', { type: 'reset' });
let n = 0; const key = () => 'e2e-' + Date.now().toString(36) + '-' + ++n;
const today = L.dayKey(Date.now());

// ---------- API security ----------
ok((await api(null, 'GET')).status === 401, 'no token: 401');
ok((await api('garbage', 'GET')).status === 401, 'garbage token: 401');
const tv = T.planner.split('.'); const forged = Buffer.from('u-mgr.' + (Date.now() + 1e7)).toString('base64url') + '.' + tv[1];
ok((await api(forged, 'GET')).status === 401, 'forged token for another user: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: '9999' } })).status === 401, 'wrong PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: ['1111'] } })).status === 401, 'array PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: 1111 } })).status === 401, 'numeric PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: { $ne: 1 } } })).status === 401, 'object PIN: 401');
ok((await api(T.manager, 'POST', null, '{not json')).status === 400, 'malformed JSON: 400');
ok((await post('manager', { type: 'nope' })).status === 400, 'unknown action: 400');
ok((await post('manager', { type: 'constructor' })).status === 400, 'prototype name as action: 400');
ok((await post('manager', { type: '__proto__' })).status === 400, '__proto__ as action: 400');
ok((await post('manager', { type: 'toString' })).status === 400, 'toString as action: 400');
ok((await post('manager', { type: 'addClient', name: 'x'.repeat(70000) })).status === 413, 'oversized body: 413');
ok((await api(T.manager, 'DELETE')).status === 405, 'DELETE: 405');
ok((await api(T.manager, 'PUT', { op: { type: 'reset' } })).status === 405, 'PUT: 405');
ok((await api(T.manager, 'PATCH', { op: { type: 'reset' } })).status === 405, 'PATCH: 405');
ok((await post('planner', { type: 'reset' })).status === 403, 'planner cannot reset: 403');
ok((await post('finance', { type: 'reset' })).status === 403, 'finance cannot reset: 403');
ok((await post('coord', { type: 'reset' })).status === 403, 'coordinator cannot reset: 403');
ok((await post('vendor', { type: 'reset' })).status === 403, 'vendor cannot reset: 403');
ok((await api(null, 'POST', { op: { type: 'reset' } })).status === 401, 'reset without token: 401');

// ---------- permission lanes (API) ----------
const v0 = await view('manager');
ok(v0.events.length === 20 && v0.events.every((e) => e.clientName && e.hallName), 'manager view: 20 events with names');
const newEvent = () => ({ type: 'addEvent', clientId: 'cl1', hallId: 'h1', menuId: 'm1', kind: 'wedding', date: L.addDays(today, 40), guests: 200, key: key() });
ok((await post('finance', newEvent())).status === 403, 'finance cannot add events: 403');
ok((await post('coord', newEvent())).status === 403, 'coordinator cannot add events: 403');
ok((await post('vendor', newEvent())).status === 403, 'vendor cannot add events: 403');
ok((await post('planner', { type: 'updateHall', hallId: 'h1', name: 'X', capacity: 500 })).status === 403, 'planner cannot edit halls: 403');
ok((await post('planner', { type: 'addPayment', eventId: 'e14', amount: 100, method: 'cash', key: key() })).status === 403, 'planner cannot add payments: 403');
ok((await post('coord', { type: 'addPayment', eventId: 'e14', amount: 100, method: 'cash', key: key() })).status === 403, 'coordinator cannot add payments: 403');
ok((await post('vendor', { type: 'addPayment', eventId: 'e14', amount: 100, method: 'cash', key: key() })).status === 403, 'vendor cannot add payments: 403');
ok((await post('finance', { type: 'confirmEvent', eventId: 'e14' })).status === 403, 'finance cannot confirm events: 403');
ok((await post('coord', { type: 'cancelEvent', eventId: 'e14' })).status === 403, 'coordinator cannot cancel events: 403');
ok((await post('finance', { type: 'toggleChecklist', itemId: 'k1' })).status === 403, 'finance cannot toggle checklist: 403');
ok((await post('vendor', { type: 'assignVendor', eventId: 'e13', kind: 'dj', vendorName: 'X', cost: 100, key: key() })).status === 403, 'vendor cannot assign vendors: 403');

// ---------- views: money and scope per role ----------
const vc = await view('coord');
ok(vc.events.every((e) => e.rate === undefined && e.amount === undefined && e.paid === 0), 'coordinator: no rates, amounts or payments');
ok(vc.payments.length === 0, 'coordinator: no payments list');
ok(vc.reports.byMonth.every((m) => m.booked === 0 && m.collected === 0) && (vc.reports.totals.outstanding || 0) === 0, 'coordinator: money totals zeroed');
ok(!vc.insights.some((i) => i.kind === 'balance_near_event' || i.kind === 'refund_owed'), 'coordinator: no money insights');
ok(vc.audit.length === 0, 'coordinator: no audit log');
const vv = await view('vendor');
ok(vv.jobs.length > 0 && vv.jobs.every((j) => j.cost === undefined), 'vendor: own jobs only, no costs');
ok(vv.events.length === 0 && vv.clients.length === 0 && vv.checklist.length === 0 && vv.payments.length === 0, 'vendor: no events, clients, checklist or payments');
ok(vv.insights.length === 0 && vv.audit.length === 0, 'vendor: no insights or audit');
ok((vv.reports.totals.vendorPending || 0) >= 0 && vv.reports.byMonth.length === 0, 'vendor: counts-only reports');
const vf = await view('finance');
ok(JSON.stringify(vf.events).includes('"rate"'), 'finance: sees rates');
ok(vf.audit.length === 0, 'finance: no audit log');
ok(vf.payments.length > 0 && vf.payments.every((p) => p.code && p.clientName), 'finance: payments carry event codes and client names');
ok((await view('manager')).audit.length > 0, 'manager: sees audit log');

// ---------- event lifecycle over the API ----------
const nb = (await post('planner', newEvent())).j.result;
ok(nb && nb.eventId, 'planner books an event');
ok((await post('planner', { ...newEvent(), date: L.addDays(today, 41) })).j.result.eventId !== nb.eventId, 'second event gets a new id');
ok((await post('manager', { ...newEvent(), key: key() })).status === 400, 'hall clash refused on same date');
ok((await post('manager', { ...newEvent(), date: L.addDays(today, -3), key: key() })).status === 400, 'past date refused');
ok((await post('manager', { ...newEvent(), date: L.addDays(today, 42), guests: 5, key: key() })).status === 400, 'too few guests refused');
ok((await post('manager', { ...newEvent(), date: L.addDays(today, 42), guests: 900, key: key() })).status === 400, 'over capacity refused');
ok((await post('manager', { type: 'confirmEvent', eventId: nb.eventId })).status === 400, 'confirm refused before 30% paid');
const ev1 = (await view('manager')).events.find((e) => e.id === nb.eventId);
await post('finance', { type: 'addPayment', eventId: nb.eventId, amount: Math.floor(ev1.amount * 0.29), method: 'cash', key: key() });
ok((await post('manager', { type: 'confirmEvent', eventId: nb.eventId })).status === 400, 'confirm refused at 29% paid');
await post('finance', { type: 'addPayment', eventId: nb.eventId, amount: Math.ceil(ev1.amount * 0.3) - Math.floor(ev1.amount * 0.29), method: 'card', key: key() });
ok((await post('planner', { type: 'confirmEvent', eventId: nb.eventId })).status === 200, 'confirm passes at 30% paid');
ok((await post('finance', { type: 'addPayment', eventId: nb.eventId, amount: ev1.amount, method: 'cash', key: key() })).status === 400, 'payment above balance refused');
ok((await post('finance', { type: 'addPayment', eventId: nb.eventId, amount: 100, method: 'cheque', key: key() })).status === 400, 'unknown method refused');
ok((await post('finance', { type: 'addPayment', eventId: nb.eventId, amount: 100, method: 'cash', date: L.addDays(today, 1), key: key() })).status === 400, 'future payment refused');
const cl1 = (await view('manager')).checklist.filter((c) => c.eventId === nb.eventId);
ok(cl1.length === 5 && cl1.every((c) => !c.done), 'new event starts with 5 open checklist items');
ok((await post('planner', { type: 'toggleChecklist', itemId: cl1[0].id })).status === 200, 'planner toggles a checklist item');
ok((await post('planner', { type: 'addChecklist', eventId: nb.eventId, title: 'Extra walkthrough', key: key() })).status === 200, 'planner adds a checklist item');
ok((await post('manager', { type: 'markHeld', eventId: nb.eventId })).status === 400, 'markHeld refused before the date passes');
const asg = (await post('manager', { type: 'assignVendor', eventId: nb.eventId, kind: 'dj', vendorName: 'DJ Kimo', vendorUserId: 'u-vendor', cost: 12000, key: key() })).j.result;
ok(asg && asg.jobId, 'manager assigns a vendor job');
ok((await post('vendor', { type: 'updateVendorJob', jobId: asg.jobId, status: 'accepted' })).status === 200, 'vendor accepts own job');
ok((await post('vendor', { type: 'updateVendorJob', jobId: asg.jobId, status: 'assigned' })).status === 400, 'jobs never move backward');
const asg2 = (await post('manager', { type: 'assignVendor', eventId: nb.eventId, kind: 'floral', vendorName: 'Rose House', cost: 8000, key: key() })).j.result;
ok((await post('vendor', { type: 'updateVendorJob', jobId: asg2.jobId, status: 'accepted' })).status === 403, "vendor cannot touch another vendor's job");
ok((await post('manager', { type: 'cancelEvent', eventId: nb.eventId })).status === 200, 'manager cancels the event');
ok((await view('manager')).insights.some((i) => i.kind === 'refund_owed'), 'cancelled paid event raises refund_owed');
ok((await post('manager', { ...newEvent(), key: key() })).status === 200, 'cancelled event frees the hall date');
const idem = newEvent(); idem.key = 'e2e-idem-fixed-key'; idem.date = L.addDays(today, 55);
const i1 = await post('planner', idem); const i2 = await post('planner', idem);
ok(i1.status === 200 && i2.status === 200 && i2.j.result.duplicate === true, 'idempotency key replays as duplicate');
ok((await post('planner', { ...newEvent(), key: 'abc' })).status === 400, 'short idempotency key: 400');
ok((await post('manager', { type: 'completeEvent', eventId: 'e12' })).status === 200, 'held, fully-paid event completes');
ok((await post('manager', { type: 'cancelEvent', eventId: 'e12' })).status === 400, 'completed event cannot cancel');

// ---------- browser: login and role lanes ----------
const p = await newPage();
await p.goto(U + '/', { waitUntil: 'networkidle0' });
ok((await body(p)).includes('1111'), 'sign-in lists demo roles with PINs');
ok((await p.$('#pin')) !== null, 'PIN input present');
await login(p, '1111');
let tx = await body(p);
ok(/manager|مدير/i.test(tx), 'manager lands on dashboard');
ok(!bare.test(tx), 'dashboard: no undefined/NaN');
await go(p, 'events'); tx = await body(p);
ok(tx.includes('FR-'), 'events show booking codes');
ok(!bare.test(tx), 'events: no undefined/NaN');
await go(p, 'venues'); tx = await body(p);
ok(/Grand Ballroom|قاعة/i.test(tx), 'venues page lists halls');
await go(p, 'checklist'); tx = await body(p);
ok(/contract|تجهيز|عقد/i.test(tx), 'checklist page lists items');
await go(p, 'vendors'); tx = await body(p);
ok(/Moments|DJ|تصوير/i.test(tx), 'vendors page lists jobs');
await go(p, 'clients'); tx = await body(p);
ok(!bare.test(tx), 'clients: no undefined/NaN');
await go(p, 'payments'); tx = await body(p);
ok(/EGP|ج/.test(tx), 'payments page shows money');
await go(p, 'reports'); tx = await body(p);
ok(/2026|٢٠٢٦/.test(tx), 'reports show months');
await go(p, 'audit'); tx = await body(p);
ok(/addEvent|addPayment|reset/.test(tx), 'audit log records actions');

// planner books an event through the UI
await go(p, 'events');
await p.evaluate(() => [...document.querySelectorAll('[data-act]')].find((x) => x.dataset.act === 'ev-new').click());
await sleep(400);
ok((await p.$('.modal')) !== null, 'event modal opens');
await p.type('#f-guests', '120');
await p.evaluate(() => document.querySelector('.modal [data-act="ev-save"]').click());
await sleep(700);
tx = await body(p);
ok(!bare.test(tx), 'event saved without artifacts');

// planner lane
const pa = await newPage(); await login(pa, '2222');
ok(!/Audit|التدقيق/.test(await pa.evaluate(() => document.querySelector('.nav').innerText)), 'planner nav has no audit');
ok(!/Reports|التقارير/.test(await pa.evaluate(() => document.querySelector('.nav').innerText)), 'planner nav has no reports');
tx = await body(pa);
ok(/EGP|ج/.test(tx), 'planner sees money on dashboard');

// finance lane
const pf = await newPage(); await login(pf, '3333');
await go(pf, 'payments'); tx = await body(pf);
ok(/Cash|Card|Transfer|نقد|بطاقة|تحويل/.test(tx), 'finance sees payment methods');
await pf.evaluate(() => [...document.querySelectorAll('[data-act]')].find((x) => x.dataset.act === 'ev-pay').click());
await sleep(400);
ok((await pf.$('#f-method')) !== null, 'payment modal has a method select');
await pf.select('#f-method', 'transfer');
await pf.evaluate(() => document.querySelector('.modal [data-act="pay-save"]').click());
await sleep(700);
ok(!bare.test(await body(pf)), 'payment saved without artifacts');
await go(pf, 'venues'); await sleep(300);
ok(!(await pf.evaluate(() => location.hash)).includes('venues'), 'finance redirected away from venues');

// coordinator lane
const pd = await newPage(); await login(pd, '4444');
tx = await body(pd);
ok(!/EGP|ج\.م/.test(tx), 'coordinator dashboard has no money');
await go(pd, 'events'); tx = await body(pd);
ok(tx.includes('FR-'), 'coordinator sees events');
ok(!/EGP|ج\.م/.test(tx), 'coordinator events have no money');
await go(pd, 'checklist'); tx = await body(pd);
ok(!/EGP|ج\.م/.test(tx), 'coordinator checklist has no money');
await go(pd, 'payments'); await sleep(300);
ok(!(await pd.evaluate(() => location.hash)).includes('payments'), 'coordinator redirected away from payments');

// vendor lane
const pl = await newPage(); await login(pl, '5555');
tx = await body(pl);
ok(!/EGP|ج\.م/.test(tx), 'vendor dashboard has no money');
await go(pl, 'jobs'); tx = await body(pl);
ok(/FR-|DJ|تصوير|دي جي/i.test(tx), 'vendor sees own jobs');
ok(!/EGP|ج\.م/.test(tx), 'vendor jobs have no money');
await go(pl, 'events'); await sleep(300);
ok(!(await pl.evaluate(() => location.hash)).includes('events'), 'vendor redirected away from events');

// XSS hygiene
await post('manager', { type: 'addClient', name: '<img src=x onerror=alert(1)> Hacker', phone: '0100', key: key() });
const px = await newPage(); await login(px, '1111'); await go(px, 'clients');
const xtx = await px.evaluate(() => document.body.innerHTML);
ok(!xtx.includes('<img src=x onerror'), 'client name is escaped in the DOM');

// Arabic RTL
const pr = await newPage(); await login(pr, '1111', 'ar');
ok((await pr.evaluate(() => document.documentElement.dir)) === 'rtl', 'arabic renders RTL');
ok((await body(pr)).includes('المناسبات'), 'arabic nav translated');
await go(pr, 'events');
ok(!bare.test(await body(pr)), 'arabic events: no undefined/NaN');

// mobile width
const pm = await newPage(390, 844); await login(pm, '1111');
ok((await pm.evaluate(() => document.documentElement.scrollWidth)) <= 390 + 2, 'no horizontal scroll at 390px');
await go(pm, 'reports');
ok((await pm.evaluate(() => document.documentElement.scrollWidth)) <= 390 + 2, 'reports fit 390px');

ok(errs.length === 0, 'zero page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));

await post('manager', { type: 'reset' });
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
