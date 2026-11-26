// Farah single-page app. Every action goes to /api/data; the server is the authority.
import * as L from './logic.js';
import { STR, SRV } from './i18n.js';

const LS = { get: (k, d) => { try { const v = localStorage.getItem('fr-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => localStorage.setItem('fr-' + k, JSON.stringify(v)), del: (k) => localStorage.removeItem('fr-' + k) };
const S = { lang: new URLSearchParams(location.search).get('lang') || LS.get('lang', 'en'), token: LS.get('token', null), me: LS.get('me', null), data: null, busy: false, modal: null, filter: 'open' };
const ar = () => S.lang === 'ar';
const t = (k) => (STR[S.lang] && STR[S.lang][k]) ?? STR.en[k] ?? k;
const srvErr = (m) => { const map = SRV[S.lang]; if (map && m) for (const [re, ar2] of map) { const x = m.match(re); if (x) return ar2.replace('$1', x[1] || ''); } return m || ''; };
const nf = (n, d = 0) => Number(n).toLocaleString(ar() ? 'ar-EG' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const egp = (n) => `${nf(n)} ${t('cur')}`;
const dF = (k) => k ? new Date(k + 'T12:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' }) : '';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.querySelector(id);
const D = () => S.data;
const role = () => S.me?.role;
const nm = (o) => (ar() && o?.nameAr ? o.nameAr : o?.name) || '';

const NAV = {
  manager: ['dashboard', 'events', 'venues', 'checklist', 'vendors', 'clients', 'payments', 'reports', 'audit'],
  planner: ['dashboard', 'events', 'venues', 'checklist', 'vendors', 'clients', 'payments'],
  finance: ['dashboard', 'events', 'payments', 'reports'],
  coordinator: ['dashboard', 'events', 'checklist', 'vendors'],
  vendor: ['dashboard', 'jobs'],
};
const route = () => {
  const r = (location.hash.replace(/^#\//, '') || '').split('?')[0];
  if (!S.token || !S.me) return 'login';
  const allowed = NAV[role()] || [];
  return allowed.includes(r) ? r : allowed[0];
};
const isMoney = () => ['manager', 'planner', 'finance'].includes(role());
const canPlan = () => ['manager', 'planner'].includes(role());
const canPay = () => ['manager', 'finance'].includes(role());

// ---------- api ----------
async function api(method, op) {
  let r;
  try { r = await fetch('/api/data', { method, headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: op ? JSON.stringify({ op }) : undefined }); }
  catch { throw new Error('Network error'); }
  const j = await r.json().catch(() => null);
  if (r.status === 401 && !(op && op.type === 'login')) { logout(false); throw new Error(srvErr('Sign in again')); }
  if (!r.ok) { const e = new Error(srvErr(j?.error) || 'Server error'); e.status = r.status; throw e; }
  return j;
}
async function refresh() { S.data = await api('GET'); }
async function doOp(op, msg) {
  if (S.busy) return null;
  S.busy = true;
  try { const j = await api('POST', op); S.data = j; if (msg) toast(msg); return j.result || {}; }
  catch (e) { toast(e.message, true); return null; } finally { S.busy = false; }
}
function toast(msg, bad) {
  const el = $('#toast'); el.innerHTML = `<div class="${bad ? 'err' : ''}">${esc(msg)}</div>`;
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.innerHTML = ''), 4500);
}
function logout(reload = true) {
  LS.del('token'); LS.del('me'); S.token = null; S.me = null; S.data = null; S.modal = null;
  if (reload) { location.hash = '#/'; render(); }
}

// ---------- small views ----------
const pill = (txt, cls = '') => `<span class="pill ${cls}">${esc(txt)}</span>`;
const sel = (id, list, cur, extra = '') => `<select id="${id}" ${extra}>${list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const field = (id, label, inner) => `<div class="f"><label for="${id}">${esc(label)}</label>${inner}</div>`;
const inp = (id, label, v = '', attrs = '') => field(id, label, `<input id="${id}" value="${esc(v)}" ${attrs}>`);
const val = (id) => $(id)?.value?.trim() ?? '';
const num = (id) => (val(id) === '' ? NaN : Number(val(id)));
const tbl = (head, rows, empty) => `<div class="tw"><table><thead><tr>${head.map((h) => `<th${h[1] ? ' class="num"' : ''}>${esc(Array.isArray(h) ? h[0] : h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="empty">${esc(empty || t('noRows'))}</td></tr>`}</tbody></table></div>`;
const modalBg = (inner, wide) => `<div class="modal-bg" data-act="bg"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${inner}</div></div>`;
const mhead = (title) => `<div class="mhead"><h3>${esc(title)}</h3><button class="btn sm ghost2" data-act="bg" aria-label="Close">✕</button></div>`;

const LOGO = `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="rgba(255,255,255,.12)"/><path d="M24 36c-8-4.5-13-9.5-13-15a7.5 7.5 0 0 1 13-5.2A7.5 7.5 0 0 1 37 21c0 5.5-5 10.5-13 15z" fill="#c98aa6"/></svg>`;
function shell(inner) {
  const tt = D().reports.totals;
  const nav = NAV[role()].map((r) => `<a href="#/${r}" class="${route() === r ? 'on' : ''}">${esc(t('nav.' + r))}${r === 'checklist' && tt.checklistOpen ? ` <b class="dot">${tt.checklistOpen}</b>` : ''}</a>`).join('');
  return `<div class="top"><a class="brand" href="#/${NAV[role()][0]}">${LOGO}<span>Farah<small>${esc(t('app.tag'))}</small></span></a>
    <nav class="nav">${nav}</nav><div class="tools"><span class="pill">${esc(t('role.' + role()))} · ${esc(nm(S.me))}</span>
    <button class="btn ghost sm" data-act="lang">${ar() ? 'English' : 'العربية'}</button><button class="btn ghost sm" data-act="logout">${esc(t('signin.out'))}</button></div></div><main>${inner}</main>${modalHtml()}`;
}
function loginPage() {
  return `<main class="login"><div class="card login-card"><div class="brand big">${LOGO}<span>Farah<small>${esc(t('app.tag'))}</small></span></div>
    <h1>${esc(t('signin.title'))}</h1><p class="muted">${esc(t('signin.pick'))}</p>
    <div class="demo-users">${L.DEMO_USERS.map((u) => `<button class="btn" data-act="pin" data-pin="${u.pin}"><span>${esc(ar() ? u.labelAr : u.label)}</span><b>${u.pin}</b></button>`).join('')}</div>
    <div class="f"><label for="pin">${esc(t('signin.pin'))}</label><input id="pin" class="big" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="••••"></div>
    <button class="btn pri big" data-act="login" style="width:100%">${esc(t('signin.go'))}</button>
    <div class="row" style="margin-top:.4rem"><button class="btn sm" data-act="lang">${ar() ? 'English' : 'العربية'}</button></div></div></main>`;
}

// ---------- insights ----------
function insightText(i) {
  if (i.kind === 'event_soon' || i.kind === 'deposit_missing') return esc(i.code) + ' · ' + esc(i.name) + ': ' + t('ins.' + i.kind).replace('{n}', nf(i.days));
  if (i.kind === 'checklist_open' || i.kind === 'vendor_pending') return esc(i.code) + ': ' + t('ins.' + i.kind).replace('{n}', nf(i.n)).replace('{d}', nf(i.days));
  if (i.kind === 'balance_near_event') return esc(i.code) + ': ' + t('ins.balance_near_event').replace('{a}', egp(i.amount)).replace('{d}', nf(i.days));
  if (i.kind === 'refund_owed') return esc(i.code) + ': ' + t('ins.refund_owed').replace('{a}', egp(i.amount));
  return i.kind;
}
const INS_PILL = {
  event_soon: ['nav.events', 'ice'], deposit_missing: ['nav.payments', 'bad'], balance_near_event: ['nav.payments', 'off'],
  checklist_open: ['nav.checklist', 'bad'], vendor_pending: ['nav.vendors', 'off'], refund_owed: ['nav.payments', 'bad'],
};
const insPill = (k) => { const [label, cls] = INS_PILL[k] || ['nav.dashboard', '']; return pill(t(label), cls); };

// ---------- dashboard ----------
const kpi = (n, l, s = '', cls = '') => `<div class="card kpi ${cls}"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`;
function pgDashboard() {
  const d = D(), tt = d.reports.totals;
  if (role() === 'vendor') {
    return `<div class="bar"><h1>${esc(t('nav.dashboard'))}</h1></div>
    <div class="grid kpis">${kpi(nf(tt.vendorPending || 0), t('k.vendorPending'), '', tt.vendorPending ? 'warn' : '')}${kpi(nf(tt.vendorDone || 0), t('k.vendorDone'))}</div>
    <section class="card" style="margin-top:1rem"><h2>${esc(t('nav.jobs'))}</h2>${jobsTable(d.jobs)}</section>`;
  }
  const upcoming = d.events.filter((e) => e.date >= d.today && !['cancelled', 'completed'].includes(e.status)).slice(0, 6);
  const kpis = [`${kpi(nf(tt.upcomingEvents), t('k.upcomingEvents'))}${kpi(nf(tt.eventsThisWeek), t('k.thisWeek'), '', tt.eventsThisWeek ? 'warn' : '')}${kpi(nf(tt.guestsBooked), t('k.guestsBooked'))}${kpi(nf(tt.checklistOpen), t('k.checklistOpen'), '', tt.checklistOpen ? 'warn' : '')}${kpi(nf(tt.vendorPending), t('k.vendorPending'), '', tt.vendorPending ? 'warn' : '')}`];
  if (isMoney()) kpis.push(kpi(egp(tt.bookedThisMonth), t('k.booked')) + kpi(egp(tt.collectedThisMonth), t('k.collected')) + kpi(egp(tt.outstanding), t('k.outstanding'), '', tt.outstanding ? 'warn' : ''));
  return `<div class="bar"><h1>${esc(t('nav.dashboard'))}</h1></div>
  <div class="grid kpis">${kpis.join('')}</div>
  <div class="grid two" style="margin-top:1rem">
  <section class="card"><h2>${esc(t('dash.upcoming'))}</h2>${upcoming.map((e) => `<div class="mrow"><div><b>${esc(dF(e.date))}</b> <span class="small muted">${esc(e.clientName)} · ${esc(t('ek.' + e.kind))}</span></div><span class="small">${esc(e.hallName)}</span></div>`).join('') || `<p class="empty">${esc(t('noRows'))}</p>`}</section>
  <section class="card"><h2>${esc(t('insights'))}</h2>${d.insights.length ? d.insights.map((i) => `<div class="att-row"><span>${insPill(i.kind)} ${insightText(i)}</span></div>`).join('') : `<p class="empty">${esc(t('none'))}</p>`}</section></div>`;
}

// ---------- events ----------
const EVENT_STATUS_PILL = { reserved: 'warn', confirmed: 'on', held: 'ice', completed: '', cancelled: 'off' };
function pgEvents() {
  const d = D();
  const FILTERS = ['open', 'upcoming', 'held', 'completed', 'cancelled', 'all'];
  let ev = d.events;
  if (S.filter === 'open') ev = ev.filter((e) => ['reserved', 'confirmed'].includes(e.status));
  else if (S.filter === 'upcoming') ev = ev.filter((e) => e.date >= d.today && ['reserved', 'confirmed'].includes(e.status));
  else if (['held', 'completed', 'cancelled'].includes(S.filter)) ev = ev.filter((e) => e.status === S.filter);
  ev = ev.slice(0, 40);
  const head = [[t('th.code')], [t('th.date')], [t('th.client')], [t('th.hall')], [t('th.kind')], [t('th.guests'), 1]];
  if (isMoney()) head.push([t('th.price'), 1], [t('th.paid'), 1], [t('th.outstanding'), 1]);
  head.push([t('th.status')], [t('th.actions')]);
  const rows = ev.map((e) => {
    const out = Math.max(0, e.amount - e.paid);
    let cells = `<td><b>${esc(e.code)}</b></td><td>${esc(dF(e.date))}</td><td>${esc(e.clientName)}</td><td>${esc(e.hallName)}</td><td>${esc(t('ek.' + e.kind))}</td><td class="num">${nf(e.guests)}</td>`;
    if (isMoney()) cells += `<td class="num">${egp(e.amount)}</td><td class="num">${egp(e.paid)}</td><td class="num">${out ? `<b style="color:var(--bad)">${egp(out)}</b>` : egp(0)}</td>`;
    cells += `<td>${pill(t('st.' + e.status), EVENT_STATUS_PILL[e.status])}${e.status === 'cancelled' && e.paid > 0 ? ' ' + pill(t('st.refundOwed'), 'bad') : ''}</td>`;
    cells += `<td class="rowact">${eventActions(e)}</td>`;
    return `<tr>${cells}</tr>`;
  });
  return `<div class="bar"><h1>${esc(t('nav.events'))}</h1><div class="bar-act">${FILTERS.map((f) => `<button class="chip ${S.filter === f ? 'on' : ''}" data-act="evfilter" data-v="${f}">${esc(t('ev.f' + f.charAt(0).toUpperCase() + f.slice(1)))}</button>`).join('')}${canPlan() ? `<button class="btn pri sm" data-act="ev-new">${esc(t('ev.new'))}</button>` : ''}</div></div>
  ${tbl(head, rows)}`;
}
function eventActions(e) {
  const b = (act, label, data = '') => `<button class="btn sm ghost2" data-act="${act}" data-id="${e.id}" ${data}>${esc(label)}</button>`;
  const out = [];
  if (canPlan()) {
    if (e.status === 'reserved') out.push(b('ev-confirm', t('act.confirm')));
    if (e.status === 'confirmed') { out.push(b('ev-held', t('act.hold'))); out.push(b('ev-complete', t('act.complete'))); }
    if (['reserved', 'confirmed', 'held'].includes(e.status)) { out.push(b('ev-assign', t('act.assign'))); out.push(b('ev-cancel', t('act.cancel'))); }
  }
  if (canPay() && ['reserved', 'confirmed', 'held'].includes(e.status)) out.push(b('ev-pay', t('act.pay')));
  return out.join('');
}

// ---------- venues ----------
function pgVenues() {
  const d = D();
  const hallRows = d.halls.map((h) => {
    const upcoming = d.events.filter((e) => e.hallId === h.id && e.date >= d.today && ['reserved', 'confirmed'].includes(e.status)).length;
    return `<tr><td><b>${esc(nm(h))}</b></td><td>${esc(t('hk.' + h.kind))}</td><td class="num">${nf(h.capacity)}</td><td class="num">${nf(upcoming)}</td><td class="rowact">${role() === 'manager' ? `<button class="btn sm ghost2" data-act="hall-edit" data-id="${h.id}">${esc(t('btn.edit'))}</button>` : ''}</td></tr>`;
  });
  const menuRows = d.menus.map((m) => `<tr><td><b>${esc(nm(m))}</b></td><td>${esc(t('mt.' + m.tier))}</td>${isMoney() ? `<td class="num">${egp(m.perGuest)}</td>` : ''}<td class="rowact">${role() === 'manager' ? `<button class="btn sm ghost2" data-act="menu-edit" data-id="${m.id}">${esc(t('btn.edit'))}</button>` : ''}</td></tr>`);
  return `<div class="bar"><h1>${esc(t('nav.venues'))}</h1>${role() === 'manager' ? `<div class="bar-act"><button class="btn pri sm" data-act="menu-new">${esc(t('ven.newMenu'))}</button></div>` : ''}</div>
  <section class="card"><h2>${esc(t('ven.halls'))}</h2>${tbl([[t('th.name')], [t('th.kind')], [t('th.capacity'), 1], [t('ven.upcoming'), 1], ['']], hallRows)}</section>
  <section class="card" style="margin-top:1rem"><h2>${esc(t('ven.menus'))}</h2>${tbl([[t('th.name')], [t('th.kind')], ...(isMoney() ? [[t('th.price'), 1]] : []), ['']], menuRows)}</section>`;
}

// ---------- checklist ----------
function pgChecklist() {
  const d = D();
  const open = d.checklist.filter((c) => !c.done), done = d.checklist.filter((c) => c.done).slice(-15).reverse();
  const row = (c) => `<div class="mrow"><div><button class="btn sm ${c.done ? 'ghost2' : 'pri'}" data-act="cl-toggle" data-id="${c.id}">${c.done ? '✓' : esc(t('btn.done'))}</button> <b>${esc(c.title)}</b></div><span class="small muted">${esc(c.code)} · ${esc(c.clientName)} · ${esc(t('cl.due'))} ${esc(dF(c.date))}</span></div>`;
  return `<div class="bar"><h1>${esc(t('nav.checklist'))}</h1>${canPlan() ? `<div class="bar-act"><button class="btn pri sm" data-act="cl-new">${esc(t('cl.new'))}</button></div>` : ''}</div>
  <section class="card"><h2>${esc(t('cl.open'))} (${nf(open.length)})</h2>${open.map(row).join('') || `<p class="empty">${esc(t('none'))}</p>`}</section>
  <section class="card" style="margin-top:1rem"><h2>${esc(t('cl.done'))}</h2>${done.map(row).join('') || `<p class="empty">${esc(t('none'))}</p>`}</section>`;
}

// ---------- vendors ----------
const JOB_PILL = { assigned: 'warn', accepted: 'ice', done: '' };
const jobCells = (j) => {
  if (role() === 'vendor') return `<td><b>${esc(j.code)}</b></td><td>${esc(t('vd.' + j.kind))}</td>`;
  return `<td><b>${esc(j.code)}</b></td><td>${esc(j.clientName)}</td><td>${esc(t('vd.' + j.kind))}</td><td>${esc(j.vendorName)}</td>${isMoney() ? `<td class="num">${egp(j.cost)}</td>` : ''}`;
};
const jobNext = { assigned: ['accepted', 'act.acceptJob'], accepted: ['done', 'act.doneJob'] };
function jobsTable(jobs) {
  const head = role() === 'vendor'
    ? [[t('th.code')], [t('th.kind')], [t('th.date')], [t('th.status')], [t('th.actions')]]
    : [[t('th.code')], [t('th.client')], [t('th.kind')], [t('th.vendor')], ...(isMoney() ? [[t('th.cost'), 1]] : []), [t('th.date')], [t('th.status')], [t('th.actions')]];
  const rows = jobs.map((j) => {
    const nxt = jobNext[j.status];
    const canStep = ['manager', 'planner', 'vendor'].includes(role());
    return `<tr>${jobCells(j)}<td>${esc(dF(j.date))}</td><td>${pill(t('st.' + j.status), JOB_PILL[j.status])}</td><td class="rowact">${nxt && canStep ? `<button class="btn sm ghost2" data-act="job-stage" data-id="${j.id}" data-v="${nxt[0]}">${esc(t(nxt[1]))}</button>` : ''}</td></tr>`;
  });
  return tbl(head, rows);
}
function pgVendors() {
  const d = D();
  const vendMap = new Map();
  for (const j of d.jobs) { const v = vendMap.get(j.vendorName) || { name: j.vendorName, kind: j.kind, jobs: 0, pending: 0 }; v.jobs++; if (j.status !== 'done') v.pending++; vendMap.set(j.vendorName, v); }
  const vrows = [...vendMap.values()].map((v) => `<tr><td><b>${esc(v.name)}</b></td><td>${esc(t('vd.' + v.kind))}</td><td class="num">${nf(v.jobs)}</td><td class="num">${nf(v.pending)}</td></tr>`);
  return `<div class="bar"><h1>${esc(t('nav.vendors'))}</h1>${canPlan() ? `<div class="bar-act"><button class="btn pri sm" data-act="ev-assign0">${esc(t('ven.newJob'))}</button></div>` : ''}</div>
  <section class="card"><h2>${esc(t('ven.vendorList'))}</h2>${tbl([[t('th.vendor')], [t('th.kind')], [t('ven.jobs'), 1], [t('k.vendorPending'), 1]], vrows)}</section>
  <section class="card" style="margin-top:1rem"><h2>${esc(t('ven.jobs'))}</h2>${jobsTable(d.jobs)}</section>`;
}
function pgJobs() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.jobs'))}</h1></div><section class="card">${jobsTable(d.jobs)}</section>`;
}

// ---------- clients ----------
function pgClients() {
  const d = D();
  const rows = d.clients.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone)}</td><td class="num">${nf(c.events)}</td>${isMoney() ? `<td class="num">${egp(c.booked)}</td><td class="num">${egp(c.paid)}</td>` : ''}<td class="rowact">${canPlan() ? `<button class="btn sm ghost2" data-act="cl-edit" data-id="${c.id}">${esc(t('btn.edit'))}</button>` : ''}</td></tr>`);
  return `<div class="bar"><h1>${esc(t('nav.clients'))}</h1>${canPlan() ? `<div class="bar-act"><button class="btn pri sm" data-act="client-new">${esc(t('cl.newClient'))}</button></div>` : ''}</div>
  ${tbl([[t('th.name')], [t('th.phone')], [t('th.events'), 1], ...(isMoney() ? [[t('th.booked'), 1], [t('th.paid'), 1]] : []), ['']], rows)}`;
}

// ---------- payments ----------
const PAY_METHODS = ['card', 'cash', 'transfer'];
function pgPayments() {
  const d = D();
  const rows = d.payments.slice(0, 40).map((p) => `<tr><td>${esc(dF(p.date))}</td><td><b>${esc(p.code)}</b></td><td>${esc(p.clientName)}</td><td>${esc(t('pay.' + p.method))}</td><td class="num">${egp(p.amount)}</td></tr>`);
  const due = d.events.filter((e) => ['reserved', 'confirmed', 'held'].includes(e.status)).sort((a, b) => (b.amount - b.paid) - (a.amount - a.paid)).slice(0, 12);
  const dueRows = due.map((e) => { const out = e.amount - e.paid; return `<tr><td><b>${esc(e.code)}</b></td><td>${esc(e.clientName)}</td><td>${esc(dF(e.date))}</td><td class="num">${out > 0 ? `<b style="color:var(--bad)">${egp(out)}</b>` : egp(0)}</td><td class="rowact">${out > 0 ? `<button class="btn sm ghost2" data-act="ev-pay" data-id="${e.id}">${esc(t('act.pay'))}</button>` : ''}</td></tr>`; });
  return `<div class="bar"><h1>${esc(t('nav.payments'))}</h1></div>
  <section class="card"><h2>${esc(t('pay.due'))}</h2>${tbl([[t('th.code')], [t('th.client')], [t('th.date')], [t('th.outstanding'), 1], ['']], dueRows)}</section>
  <section class="card" style="margin-top:1rem"><h2>${esc(t('pay.recent'))}</h2>${tbl([[t('th.date')], [t('th.code')], [t('th.client')], [t('th.method')], [t('th.amount'), 1]], rows)}</section>`;
}

// ---------- reports ----------
function bars(vals) { const mx = Math.max(1, ...vals); return vals.map((v) => `<span class="bar-v" title="${nf(v)}" style="height:${Math.max(2, Math.round((v / mx) * 60))}px"></span>`).join(''); }
function pgReports() {
  const r = D().reports;
  const mrows = r.byMonth.map((m) => `<tr><td>${esc(m.month)}</td><td class="num">${nf(m.events)}</td><td class="num">${nf(m.guests)}</td><td class="num">${egp(m.booked)}</td><td class="num">${egp(m.collected)}</td></tr>`);
  const hrows = r.perHall.map((h) => `<tr><td><b>${esc(nm(h))}</b></td><td class="num">${nf(h.events)}</td><td class="num">${nf(h.guests)}</td><td class="num">${egp(h.booked)}</td><td class="num">${egp(h.collected)}</td></tr>`);
  return `<div class="bar"><h1>${esc(t('nav.reports'))}</h1></div>
  <div class="grid two">
    <div class="card"><div class="bar"><h2>${esc(t('rep.monthly'))}</h2><span class="muted">${esc(t('rep.booked'))}</span></div><div class="bars">${bars(r.byMonth.map((m) => m.booked))}</div>
    ${tbl([[t('th.month')], [t('th.events'), 1], [t('th.guests'), 1], [t('th.booked'), 1], [t('th.paid'), 1]], mrows)}</div>
    <div class="card"><div class="bar"><h2>${esc(t('rep.halls'))}</h2></div>${tbl([[t('th.hall')], [t('th.events'), 1], [t('th.guests'), 1], [t('th.booked'), 1], [t('th.paid'), 1]], hrows)}</div>
  </div>`;
}

// ---------- audit ----------
function pgAudit() {
  const rows = D().audit.slice(0, 60).map((a) => `<tr><td class="small">${esc(new Date(a.ts).toLocaleString(ar() ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</td><td>${esc(ar() ? a.name : a.name)}</td><td><b>${esc(a.action)}</b></td><td class="small">${esc(a.detail)}</td></tr>`);
  return `<div class="bar"><h1>${esc(t('nav.audit'))}</h1></div>${tbl([[t('th.time')], [t('th.user')], [t('th.action')], [t('th.detail')]], rows)}`;
}

// ---------- modals ----------
function openModal(name, extra = {}) { S.modal = { name, ...extra }; render(); }
function modalHtml() {
  if (!S.modal || !S.token) return '';
  const d = D(), m = S.modal;
  const submit = (act, label) => `<div class="row" style="margin-top:.6rem"><button class="btn pri" data-act="${act}">${esc(label)}</button></div>`;
  if (m.name === 'event') {
    const clients = d.clients.map((c) => [c.id, c.name]), halls = d.halls.map((h) => [h.id, `${nm(h)} (${nf(h.capacity)})`]), menus = d.menus.map((x) => [x.id, nm(x)]), kinds = L.EVENT_KINDS.map((k) => [k, t('ek.' + k)]);
    return modalBg(`${mhead(t('ev.new'))}${field('f-client', t('th.client'), sel('f-client', clients, clients[0]?.[0]))}${field('f-hall', t('th.hall'), sel('f-hall', halls, halls[0]?.[0]))}${field('f-menu', t('ev.menu'), sel('f-menu', menus, menus[0]?.[0]))}${field('f-kind', t('th.kind'), sel('f-kind', kinds, kinds[0]?.[0]))}${inp('f-date', t('th.date'), d.today, 'type="date"')}${inp('f-guests', t('th.guests'), '', 'type="number" min="1"')}${inp('f-notes', t('th.notes'), '')}${submit('ev-save', t('btn.save'))}`);
  }
  if (m.name === 'client') {
    const c = m.id ? d.clients.find((x) => x.id === m.id) : null;
    return modalBg(`${mhead(c ? t('btn.edit') : t('cl.newClient'))}${inp('f-name', t('th.name'), c?.name || '')}${inp('f-phone', t('th.phone'), c?.phone || '')}${inp('f-notes', t('th.notes'), c?.notes || '')}${submit('client-save', t('btn.save'))}`);
  }
  if (m.name === 'menu') {
    const x = m.id ? d.menus.find((y) => y.id === m.id) : null;
    const tiers = L.MENU_TIERS.map((k) => [k, t('mt.' + k)]);
    return modalBg(`${mhead(x ? t('btn.edit') : t('ven.newMenu'))}${inp('f-name', t('th.name'), x ? nm(x) : '')}${field('f-tier', t('th.kind'), sel('f-tier', tiers, x?.tier || 'silver'))}${inp('f-price', t('th.price'), x?.perGuest ?? '', 'type="number" min="1"')}${submit('menu-save', t('btn.save'))}`);
  }
  if (m.name === 'hall') {
    const h = d.halls.find((y) => y.id === m.id);
    return modalBg(`${mhead(t('btn.edit'))}${inp('f-name', t('th.name'), h ? nm(h) : '')}${inp('f-cap', t('th.capacity'), h?.capacity || '', 'type="number" min="1"')}${submit('hall-save', t('btn.save'))}`);
  }
  if (m.name === 'checklist') {
    const evs = d.events.filter((e) => !['completed', 'cancelled'].includes(e.status)).map((e) => [e.id, `${e.code} · ${e.clientName}`]);
    return modalBg(`${mhead(t('cl.new'))}${field('f-event', t('nav.events'), sel('f-event', evs, evs[0]?.[0]))}${inp('f-title', t('th.item'), '')}${submit('cl-save', t('btn.save'))}`);
  }
  if (m.name === 'assign') {
    const evs = d.events.filter((e) => !['completed', 'cancelled'].includes(e.status)).map((e) => [e.id, `${e.code} · ${e.clientName}`]);
    const kinds = L.VENDOR_KINDS.map((k) => [k, t('vd.' + k)]);
    const seenV = new Map(); for (const j of d.jobs) if (!seenV.has(j.vendorName)) seenV.set(j.vendorName, j.vendorUserId || '');
    const vend = [['', '—'], ...[...seenV.entries()].map(([name, uid]) => [uid || name, name])];
    return modalBg(`${mhead(t('act.assign'))}${field('f-event', t('nav.events'), sel('f-event', evs, m.eventId || evs[0]?.[0]))}${field('f-vkind', t('th.kind'), sel('f-vkind', kinds, kinds[0]?.[0]))}${field('f-vendor', t('ven.vendorList'), sel('f-vendor', vend, ''))}${inp('f-vname', t('ven.vendorName'), '')}${isMoney() ? inp('f-cost', t('th.cost'), '', 'type="number" min="1"') : ''}${submit('assign-save', t('btn.save'))}`);
  }
  if (m.name === 'pay') {
    const e = d.events.find((x) => x.id === m.id);
    if (!e) { S.modal = null; return ''; }
    const out = e.amount - e.paid;
    return modalBg(`${mhead(t('pay.record'))}<p class="small">${esc(e.code)} · ${esc(e.clientName)} · ${esc(t('th.outstanding'))} <b>${egp(out)}</b></p>${inp('f-amount', t('th.amount'), Math.max(0, out) || '', 'type="number" min="1"')}${field('f-method', t('th.method'), sel('f-method', PAY_METHODS.map((x) => [x, t('pay.' + x)]), 'card'))}${submit('pay-save', t('pay.record'))}`);
  }
  return '';
}

// ---------- render ----------
const PAGES = { dashboard: pgDashboard, events: pgEvents, venues: pgVenues, checklist: pgChecklist, vendors: pgVendors, jobs: pgJobs, clients: pgClients, payments: pgPayments, reports: pgReports, audit: pgAudit };
function render() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = ar() ? 'rtl' : 'ltr';
  document.title = 'Farah';
  if (!S.token || !S.me) { $('#app').innerHTML = loginPage(); return; }
  if (!S.data) { $('#app').innerHTML = `<main class="login"><div class="card">${esc(t('loading'))}</div></main>`; return; }
  const r = route();
  const want = '#/' + r;
  if (location.hash !== want) history.replaceState(null, '', want);
  $('#app').innerHTML = shell((PAGES[r] || pgDashboard)());
}

// ---------- actions ----------
function confirmBox(msg) { return new Promise((res) => { const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true"><p style="margin-bottom:1rem">${esc(msg)}</p><div class="row"><button class="btn danger" data-x="y">${esc(t('btn.yes'))}</button><button class="btn ghost2" data-x="n">${esc(t('btn.no'))}</button></div></div>`; document.body.append(bg); bg.addEventListener('click', (ev) => { const x = ev.target.closest('[data-x]'); if (!x) return; bg.remove(); res(x.dataset.x === 'y'); }); }); }

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const A = {
    lang: () => { S.lang = ar() ? 'en' : 'ar'; LS.set('lang', S.lang); render(); },
    logout: () => logout(),
    bg: () => { if (!el.closest('.modal') || el === e.target || el.dataset.act === 'bg') { S.modal = null; render(); } },
    login: async () => {
      try { const r = await api('POST', { type: 'login', pin: val('#pin') }); S.token = r.token; S.me = r.me; LS.set('token', r.token); LS.set('me', r.me); await refresh(); toast(t('signin.welcome').replace('{name}', nm(r.me))); history.replaceState(null, '', '#/' + NAV[r.me.role][0]); render(); }
      catch (err) { toast(err.message, true); }
    },
    pin: () => { $('#pin').value = el.dataset.pin; $('#pin').focus(); },
    evfilter: () => { S.filter = el.dataset.v; render(); },
    'ev-new': () => openModal('event'),
    'ev-save': async () => {
      const body = { type: 'addEvent', clientId: val('#f-client'), hallId: val('#f-hall'), menuId: val('#f-menu'), kind: val('#f-kind'), date: val('#f-date'), guests: num('#f-guests'), notes: val('#f-notes') || undefined };
      if (!body.date || !body.guests) return toast(t('toast.fill'), true);
      const r = await doOp(body, t('toast.saved')); if (r) { S.modal = null; render(); }
    },
    'ev-confirm': async () => { const r = await doOp({ type: 'confirmEvent', eventId: el.dataset.id }, t('toast.confirmed')); if (r) render(); },
    'ev-held': async () => { const r = await doOp({ type: 'markHeld', eventId: el.dataset.id }, t('toast.saved')); if (r) render(); },
    'ev-complete': async () => { const r = await doOp({ type: 'completeEvent', eventId: el.dataset.id }, t('toast.completed')); if (r) render(); },
    'ev-cancel': async () => { if (await confirmBox(t('confirm.cancel'))) { const r = await doOp({ type: 'cancelEvent', eventId: el.dataset.id }, t('toast.saved')); if (r) render(); } },
    'ev-assign': () => openModal('assign', { eventId: el.dataset.id }),
    'ev-assign0': () => openModal('assign'),
    'assign-save': async () => {
      const body = { type: 'assignVendor', eventId: val('#f-event'), kind: val('#f-vkind'), vendorName: val('#f-vname') || ($('#f-vendor')?.selectedOptions?.[0]?.textContent || '').trim(), cost: isMoney() ? num('#f-cost') || undefined : undefined };
      const vid = val('#f-vendor'); if (vid === 'u-vendor') body.vendorUserId = vid;
      if (!body.vendorName || body.vendorName === '—') return toast(t('toast.fill'), true);
      const r = await doOp(body, t('toast.assigned')); if (r) { S.modal = null; render(); }
    },
    'job-stage': async () => { const r = await doOp({ type: 'updateVendorJob', jobId: el.dataset.id, status: el.dataset.v }, t('toast.saved')); if (r) render(); },
    'cl-new': () => openModal('checklist'),
    'cl-save': async () => { if (!val('#f-title')) return toast(t('toast.fill'), true); const r = await doOp({ type: 'addChecklist', eventId: val('#f-event'), title: val('#f-title') }, t('toast.saved')); if (r) { S.modal = null; render(); } },
    'cl-toggle': async () => { const r = await doOp({ type: 'toggleChecklist', itemId: el.dataset.id }); if (r) render(); },
    'client-new': () => openModal('client'),
    'cl-edit': () => openModal('client', { id: el.dataset.id }),
    'client-save': async () => {
      const body = S.modal.id ? { type: 'updateClient', clientId: S.modal.id, name: val('#f-name'), phone: val('#f-phone'), notes: val('#f-notes') } : { type: 'addClient', name: val('#f-name'), phone: val('#f-phone'), notes: val('#f-notes') };
      if (!body.name) return toast(t('toast.fill'), true);
      const r = await doOp(body, t('toast.saved')); if (r) { S.modal = null; render(); }
    },
    'ev-pay': () => openModal('pay', { id: el.dataset.id }),
    'pay-save': async () => { if (!(num('#f-amount') > 0)) return toast(t('toast.fill'), true); const r = await doOp({ type: 'addPayment', eventId: S.modal.id, amount: num('#f-amount'), method: val('#f-method') }, t('toast.paid')); if (r) { S.modal = null; render(); } },
    'menu-new': () => openModal('menu'),
    'menu-edit': () => openModal('menu', { id: el.dataset.id }),
    'menu-save': async () => {
      const body = S.modal.id ? { type: 'updateMenu', menuId: S.modal.id, name: val('#f-name'), perGuest: num('#f-price') } : { type: 'addMenu', name: val('#f-name'), tier: val('#f-tier'), perGuest: num('#f-price') };
      if (!body.name || !(body.perGuest > 0)) return toast(t('toast.fill'), true);
      const r = await doOp(body, t('toast.saved')); if (r) { S.modal = null; render(); }
    },
    'hall-edit': () => openModal('hall', { id: el.dataset.id }),
    'hall-save': async () => { const body = { type: 'updateHall', hallId: S.modal.id, name: val('#f-name'), capacity: num('#f-cap') }; if (!body.name || !(body.capacity > 0)) return toast(t('toast.fill'), true); const r = await doOp(body, t('toast.saved')); if (r) { S.modal = null; render(); } },
  };
  if (A[act]) A[act]();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.modal) { S.modal = null; render(); }
  if (e.key === 'Enter' && $('#pin') && document.activeElement === $('#pin')) $('[data-act="login"]')?.click();
});
window.addEventListener('hashchange', () => { if (S.token) { S.modal = null; render(); } });

// ---------- boot ----------
(async () => {
  render();
  if (S.token) { try { await refresh(); } catch { /* login again */ } render(); }
})();
