// Farah — shared business logic. Runs verbatim in the browser, the serverless API and the tests.
export const TZ = 'Africa/Cairo';
export const MAX_AMOUNT = 5000000;
export const ROLES = ['manager', 'planner', 'finance', 'coordinator', 'vendor'];
export const HALL_KINDS = ['indoor', 'garden', 'roof'];
export const MENU_TIERS = ['silver', 'gold', 'royal'];
export const EVENT_KINDS = ['wedding', 'engagement', 'katb', 'graduation', 'corporate'];
export const EVENT_STAGES = ['reserved', 'confirmed', 'held', 'completed'];
export const JOB_STAGES = ['assigned', 'accepted', 'done'];
export const VENDOR_KINDS = ['photo', 'dj', 'floral', 'cake', 'lights'];
export const CONFIRM_MIN_PCT = 30; // an event confirms only once 30% is paid
export const EVENT_SOON_DAYS = 7;
export const CHECKLIST_SOON_DAYS = 14;
export const PAY_SOON_DAYS = 21;
export const DEMO_USERS = [
  { id: 'u-mgr', pin: '1111', role: 'manager', name: 'Salma Riad', nameAr: 'سلمى رياض', label: 'Venue manager', labelAr: 'مديرة القاعات' },
  { id: 'u-planner', pin: '2222', role: 'planner', name: 'Omar Nabil', nameAr: 'عمر نبيل', label: 'Wedding planner', labelAr: 'منظم الأفراح' },
  { id: 'u-finance', pin: '3333', role: 'finance', name: 'Dina Samy', nameAr: 'دينا سامي', label: 'Finance', labelAr: 'الحسابات' },
  { id: 'u-coord', pin: '4444', role: 'coordinator', name: 'Hany Adel', nameAr: 'هاني عادل', label: 'Day coordinator', labelAr: 'منسق يوم الفرح' },
  { id: 'u-vendor', pin: '5555', role: 'vendor', name: 'Moments Photography', nameAr: 'لحظات للتصوير', label: 'Vendor partner', labelAr: 'شريك خدمات' },
];
export class UserError extends Error {}
export class PermError extends Error {}

// ---------- dates ----------
const parse = (k) => Date.parse(k + 'T00:00:00Z');
export const dayKey = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ });
export const addDays = (k, n) => new Date(parse(k) + n * 864e5).toISOString().slice(0, 10);
export const monthOf = (k) => k.slice(0, 7);
export const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const isKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));

// ---------- validation ----------
export const str = (v, min, max, label) => { if (typeof v !== 'string' || v.trim().length < min || v.length > max) throw new UserError(label + ' is not valid'); return v.trim(); };
export const optStr = (v, max, label) => (v === undefined || v === null || v === '' ? '' : str(v, 0, max, label));
export const intIn = (v, min, max, label) => { if (!Number.isInteger(v) || v < min || v > max) throw new UserError(label + ' is not valid'); return v; };
export const oneOf = (v, list, msg) => { if (!list.includes(v)) throw new UserError(msg); return v; };
export const need = (user, roles) => { if (!roles.includes(user.role)) throw new PermError('Not allowed'); };
export const find = (list, id, label) => { const x = list.find((y) => y.id === id); if (!x) throw new UserError(label + ' not found'); return x; };
export const txDate = (op, now) => { const k = op.date ? oneOf(isKey(op.date) ? op.date : null, [op.date], 'Date is not valid') : dayKey(now); if (k > dayKey(now)) throw new UserError('A payment cannot be dated in the future'); return k; };

// ---------- derived ----------
const nextId = (s, p) => `${p}${(s.counters[p] = (s.counters[p] || 0) + 1)}`;
export const activeEvents = (s, hallId) => s.events.filter((e) => e.hallId === hallId && e.status !== 'cancelled');
export const hallBusy = (s, hallId, date, ignoreId) => s.events.some((e) => e.hallId === hallId && e.date === date && e.status !== 'cancelled' && e.id !== ignoreId);
export const eventPaid = (s, e) => s.payments.filter((p) => p.eventId === e.id).reduce((x, p) => x + p.amount, 0);
export const eventBalance = (s, e) => e.amount - eventPaid(s, e);
export const vendorSpend = (s, eventId) => s.jobs.filter((j) => j.eventId === eventId).reduce((x, j) => x + j.cost, 0);
export const checklistOpen = (s, eventId) => s.checklist.filter((c) => c.eventId === eventId && !c.done).length;

const once = (s, op, fn) => {
  if (op.key !== undefined && (typeof op.key !== 'string' || op.key.length < 4 || op.key.length > 64)) throw new UserError('Bad request');
  if (op.key && s.keys.includes(op.key)) return { duplicate: true };
  const r = fn(); if (op.key) { s.keys.push(op.key); if (s.keys.length > 600) s.keys.shift(); } return r;
};
const audit = (s, user, now, action, detail) => { s.audit.unshift({ ts: now, userId: user.id, name: user.name, action, detail: String(detail).slice(0, 200) }); if (s.audit.length > 400) s.audit.length = 400; };
const getClient = (s, id) => find(s.clients, id, 'Client');
const getHall = (s, id) => find(s.halls, id, 'Hall');
const getMenu = (s, id) => find(s.menus, id, 'Menu');
const getEvent = (s, id) => find(s.events, id, 'Event');
const getJob = (s, id) => find(s.jobs, id, 'Vendor job');

// ---------- operations ----------
export const OP_ROLES = {
  addClient: ['manager', 'planner'], updateClient: ['manager', 'planner'],
  updateHall: ['manager'], addMenu: ['manager'], updateMenu: ['manager'],
  addEvent: ['manager', 'planner'], confirmEvent: ['manager', 'planner'], cancelEvent: ['manager'],
  markHeld: ['manager'], completeEvent: ['manager'],
  addChecklist: ['manager', 'planner'], toggleChecklist: ['manager', 'planner'],
  assignVendor: ['manager', 'planner'], updateVendorJob: ['manager', 'planner', 'vendor'],
  addPayment: ['manager', 'finance'],
};

export const OPS = {
  addClient(s, op, { user, now }) {
    need(user, OP_ROLES.addClient);
    return once(s, op, () => {
      const c = { id: nextId(s, 'cl'), name: str(op.name, 3, 80, 'Name'), phone: optStr(op.phone, 30, 'Phone'), notes: optStr(op.notes, 200, 'Notes'), createdAt: now };
      s.clients.push(c); audit(s, user, now, 'addClient', `${c.id} ${c.name}`); return { clientId: c.id };
    });
  },
  updateClient(s, op, { user, now }) {
    need(user, OP_ROLES.updateClient);
    const c = getClient(s, op.clientId);
    Object.assign(c, { name: str(op.name, 3, 80, 'Name'), phone: optStr(op.phone, 30, 'Phone'), notes: optStr(op.notes, 200, 'Notes') });
    audit(s, user, now, 'updateClient', c.id); return {};
  },
  updateHall(s, op, { user, now }) {
    need(user, OP_ROLES.updateHall);
    const h = getHall(s, op.hallId);
    Object.assign(h, { name: str(op.name, 3, 80, 'Hall name'), capacity: intIn(op.capacity, 20, 2000, 'Capacity') });
    audit(s, user, now, 'updateHall', h.id); return {};
  },
  addMenu(s, op, { user, now }) {
    need(user, OP_ROLES.addMenu);
    return once(s, op, () => {
      const m = { id: nextId(s, 'm'), name: str(op.name, 3, 80, 'Menu name'), tier: oneOf(op.tier, MENU_TIERS, 'Unknown menu tier'), perGuest: intIn(op.perGuest, 100, MAX_AMOUNT, 'Price per guest'), createdAt: now };
      s.menus.push(m); audit(s, user, now, 'addMenu', `${m.id} ${m.name}`); return { menuId: m.id };
    });
  },
  updateMenu(s, op, { user, now }) {
    need(user, OP_ROLES.updateMenu);
    const m = getMenu(s, op.menuId);
    Object.assign(m, { name: str(op.name, 3, 80, 'Menu name'), perGuest: intIn(op.perGuest, 100, MAX_AMOUNT, 'Price per guest') });
    audit(s, user, now, 'updateMenu', m.id); return {};
  },
  addEvent(s, op, { user, now }) {
    need(user, OP_ROLES.addEvent);
    return once(s, op, () => {
      const h = getHall(s, op.hallId);
      const date = oneOf(isKey(op.date) ? op.date : null, [op.date], 'Event date');
      if (date <= dayKey(now)) throw new UserError('The event date must be in the future');
      if (hallBusy(s, h.id, date)) throw new UserError('This hall is already booked on that date');
      const m = getMenu(s, op.menuId);
      const guests = intIn(op.guests, 20, h.capacity, 'Guests');
      const c = getClient(s, op.clientId);
      const e = { id: nextId(s, 'e'), code: `FR-${String(++s.counters.eventNo).padStart(4, '0')}`, clientId: c.id, hallId: h.id, menuId: m.id, kind: oneOf(op.kind, EVENT_KINDS, 'Unknown event kind'), date, guests, rate: m.perGuest, amount: m.perGuest * guests, status: 'reserved', notes: optStr(op.notes, 200, 'Notes'), by: user.id, createdAt: now, confirmedAt: null };
      s.events.push(e);
      for (const title of ['Sign the venue contract', 'Approve the seating plan', 'Confirm the menu tasting', 'Brief the day coordinator', 'Final guest count'])
        s.checklist.push({ id: nextId(s, 'k'), eventId: e.id, title, done: false, by: '', ts: now });
      audit(s, user, now, 'addEvent', `${e.code} ${c.name} × ${guests}`); return { eventId: e.id, code: e.code, amount: e.amount };
    });
  },
  confirmEvent(s, op, { user, now }) {
    need(user, OP_ROLES.confirmEvent);
    const e = getEvent(s, op.eventId);
    if (e.status !== 'reserved') throw new UserError('Only a reserved event can be confirmed');
    if (eventPaid(s, e) * 100 < e.amount * CONFIRM_MIN_PCT) throw new UserError('An event confirms only after 30% is paid');
    e.status = 'confirmed'; e.confirmedAt = now;
    audit(s, user, now, 'confirmEvent', e.code); return {};
  },
  markHeld(s, op, { user, now }) {
    need(user, OP_ROLES.markHeld);
    const e = getEvent(s, op.eventId);
    if (e.status !== 'confirmed') throw new UserError('Only a confirmed event can be marked held');
    if (e.date > dayKey(now)) throw new UserError('The event date has not passed yet');
    e.status = 'held';
    audit(s, user, now, 'markHeld', e.code); return {};
  },
  completeEvent(s, op, { user, now }) {
    need(user, OP_ROLES.completeEvent);
    const e = getEvent(s, op.eventId);
    if (e.status !== 'held') throw new UserError('Only a held event can be completed');
    if (eventBalance(s, e) > 0) throw new UserError('This event still has a balance');
    if (checklistOpen(s, e.id) > 0) throw new UserError('This event still has open checklist items');
    e.status = 'completed';
    audit(s, user, now, 'completeEvent', e.code); return {};
  },
  cancelEvent(s, op, { user, now }) {
    need(user, OP_ROLES.cancelEvent);
    const e = getEvent(s, op.eventId);
    if (e.status === 'completed') throw new UserError('A completed event cannot be cancelled');
    if (e.status === 'cancelled') throw new UserError('This event is already cancelled');
    e.status = 'cancelled';
    audit(s, user, now, 'cancelEvent', `${e.code}${eventPaid(s, e) > 0 ? ' refund owed' : ''}`); return {};
  },
  addChecklist(s, op, { user, now }) {
    need(user, OP_ROLES.addChecklist);
    const e = getEvent(s, op.eventId);
    if (['cancelled', 'completed'].includes(e.status)) throw new UserError('This event is no longer active');
    return once(s, op, () => {
      const c = { id: nextId(s, 'k'), eventId: e.id, title: str(op.title, 3, 120, 'Title'), done: false, by: '', ts: now };
      s.checklist.push(c); audit(s, user, now, 'addChecklist', `${e.code} ${c.title}`); return { itemId: c.id };
    });
  },
  toggleChecklist(s, op, { user, now }) {
    need(user, OP_ROLES.toggleChecklist);
    const c = find(s.checklist, op.itemId, 'Checklist item');
    const e = getEvent(s, c.eventId);
    if (['cancelled', 'completed'].includes(e.status)) throw new UserError('This event is no longer active');
    c.done = !c.done; c.by = c.done ? user.id : ''; c.ts = now;
    audit(s, user, now, 'toggleChecklist', `${e.code} ${c.title} ${c.done ? 'done' : 'reopened'}`); return {};
  },
  assignVendor(s, op, { user, now }) {
    need(user, OP_ROLES.assignVendor);
    const e = getEvent(s, op.eventId);
    if (['cancelled', 'completed'].includes(e.status)) throw new UserError('This event is no longer active');
    return once(s, op, () => {
      const j = { id: nextId(s, 'j'), eventId: e.id, kind: oneOf(op.kind, VENDOR_KINDS, 'Unknown vendor kind'), vendorName: str(op.vendorName, 3, 80, 'Vendor'), vendorUserId: op.vendorUserId === 'u-vendor' ? 'u-vendor' : null, cost: intIn(op.cost, 0, MAX_AMOUNT, 'Cost'), status: 'assigned', by: '', ts: now };
      s.jobs.push(j); audit(s, user, now, 'assignVendor', `${e.code} ${j.vendorName}`); return { jobId: j.id };
    });
  },
  updateVendorJob(s, op, { user, now }) {
    need(user, OP_ROLES.updateVendorJob);
    const j = getJob(s, op.jobId);
    if (user.role === 'vendor' && j.vendorUserId !== user.id) throw new PermError('Not your job');
    const e = getEvent(s, j.eventId);
    if (['cancelled', 'completed'].includes(e.status)) throw new UserError('This event is no longer active');
    const st = oneOf(op.status, JOB_STAGES, 'Unknown job status');
    if (JOB_STAGES.indexOf(st) <= JOB_STAGES.indexOf(j.status)) throw new UserError('A vendor job only moves forward');
    j.status = st; j.by = user.id; j.ts = now;
    audit(s, user, now, 'updateVendorJob', `${e.code} ${j.kind} → ${st}`); return {};
  },
  addPayment(s, op, { user, now }) {
    need(user, OP_ROLES.addPayment);
    const e = getEvent(s, op.eventId);
    if (['cancelled', 'completed'].includes(e.status)) throw new UserError('This event is no longer active');
    return once(s, op, () => {
      const amt = intIn(op.amount, 1, MAX_AMOUNT, 'Amount');
      if (amt > eventBalance(s, e)) throw new UserError('The payment is more than the balance');
      const p = { id: nextId(s, 'pay'), eventId: e.id, method: oneOf(op.method, ['cash', 'card', 'transfer'], 'Unknown method'), amount: amt, date: txDate(op, now), by: user.id, ts: now };
      s.payments.push(p); audit(s, user, now, 'addPayment', `${e.code} ${amt}`); return { paymentId: p.id, balance: eventBalance(s, e) };
    });
  },
};

export function applyOp(s, op, ctx) {
  const fn = Object.prototype.hasOwnProperty.call(OPS, op && op.type) ? OPS[op.type] : null;
  if (!fn) throw new UserError('Unknown action');
  return fn(s, op, ctx);
}

// ---------- reports ----------
export function monthReport(s, m) {
  const inM = (k) => monthOf(k) === m;
  const es = s.events.filter((e) => inM(dayKey(e.createdAt)) && e.status !== 'cancelled');
  const pays = s.payments.filter((p) => inM(p.date));
  return { month: m, events: es.length, guests: es.reduce((x, e) => x + e.guests, 0), booked: es.reduce((x, e) => x + e.amount, 0), collected: pays.reduce((x, p) => x + p.amount, 0) };
}

// ---------- view ----------
export function view(s, user, now) {
  const today = dayKey(now), m0 = monthOf(today);
  const money = ['manager', 'planner', 'finance'].includes(user.role);
  const isVendor = user.role === 'vendor';
  const isCoord = user.role === 'coordinator';
  const cOf = (id) => s.clients.find((c) => c.id === id);
  const hOf = (id) => s.halls.find((h) => h.id === id);
  const events = s.events.map((e) => {
    const base = { ...e, clientName: cOf(e.clientId)?.name || '', hallName: hOf(e.hallId)?.name || '', paid0: undefined, checklistOpen: checklistOpen(s, e.id), checklistTotal: s.checklist.filter((c) => c.eventId === e.id).length };
    delete base.paid0;
    if (!money) { const { rate, amount, notes, ...rest } = base; return { ...rest, paid: 0, balance: 0, vendorSpend: 0 }; }
    return { ...base, paid: eventPaid(s, e), balance: eventBalance(s, e), vendorSpend: vendorSpend(s, e.id) };
  }).sort((a, b) => (a.date < b.date ? -1 : 1));
  const jobs = s.jobs.map((j) => {
    const e = getEvent(s, j.eventId);
    const base = { ...j, code: e.code, date: e.date, hallName: hOf(e.hallId)?.name || '', eventKind: e.kind, clientName: cOf(e.clientId)?.name || '' };
    if (!money) { const { cost, ...rest } = base; return rest; }
    return base;
  }).sort((a, b) => (a.date < b.date ? -1 : 1));
  const checklist = s.checklist.map((c) => { const e = getEvent(s, c.eventId); return { ...c, code: e.code, date: e.date, clientName: cOf(e.clientId)?.name || '' }; });
  const clients = s.clients.map((c) => {
    const ce = s.events.filter((e) => e.clientId === c.id && e.status !== 'cancelled');
    const base = { ...c, events: ce.length };
    if (money) { base.booked = ce.reduce((x, e) => x + e.amount, 0); base.paid = ce.reduce((x, e) => x + eventPaid(s, e), 0); }
    return base;
  });
  const byMonth = []; for (let i = 11; i >= 0; i--) byMonth.push(monthReport(s, addMonths(m0, -i)));
  const upcoming = events.filter((e) => e.date >= today && !['cancelled', 'completed'].includes(e.status));
  const openBalances = money ? s.events.filter((e) => !['cancelled', 'completed'].includes(e.status)).reduce((x, e) => x + eventBalance(s, e), 0) : 0;
  const totals = {
    upcomingEvents: upcoming.length,
    eventsThisWeek: upcoming.filter((e) => e.date <= addDays(today, EVENT_SOON_DAYS)).length,
    guestsBooked: upcoming.reduce((x, e) => x + e.guests, 0),
    checklistOpen: s.checklist.filter((c) => { const e = getEvent(s, c.eventId); return !['cancelled', 'completed'].includes(e.status) && !c.done; }).length,
    vendorPending: s.jobs.filter((j) => { const e = getEvent(s, j.eventId); return !['cancelled', 'completed'].includes(e.status) && j.status !== 'done'; }).length,
    bookedThisMonth: byMonth[11].booked,
    collectedThisMonth: byMonth[11].collected,
    outstanding: openBalances,
  };
  const insights = [];
  for (const e of upcoming) {
    const dd = daysBetween(today, e.date);
    if (e.status === 'confirmed' && dd <= EVENT_SOON_DAYS) insights.push({ kind: 'event_soon', eventId: e.id, code: e.code, name: e.clientName, days: dd });
    if (e.status === 'reserved' && dd <= PAY_SOON_DAYS) insights.push({ kind: 'deposit_missing', eventId: e.id, code: e.code, name: e.clientName, days: dd });
    if (money && !['cancelled'].includes(e.status) && eventBalance(s, e) > 0 && dd <= PAY_SOON_DAYS) insights.push({ kind: 'balance_near_event', eventId: e.id, code: e.code, amount: eventBalance(s, e), days: dd });
    const open = checklistOpen(s, e.id);
    if (open > 0 && dd <= CHECKLIST_SOON_DAYS) insights.push({ kind: 'checklist_open', eventId: e.id, code: e.code, n: open, days: dd });
    const pend = s.jobs.filter((j) => j.eventId === e.id && j.status === 'assigned').length;
    if (pend > 0 && dd <= CHECKLIST_SOON_DAYS) insights.push({ kind: 'vendor_pending', eventId: e.id, code: e.code, n: pend, days: dd });
  }
  for (const e of s.events.filter((x) => x.status === 'cancelled' && eventPaid(s, x) > 0)) if (money) insights.push({ kind: 'refund_owed', eventId: e.id, code: e.code, amount: eventPaid(s, e) });
  const perHall = s.halls.map((h) => {
    const he = s.events.filter((e) => e.hallId === h.id && e.status !== 'cancelled');
    const base = { id: h.id, name: h.name, nameAr: h.nameAr, upcoming: upcoming.filter((e) => e.hallId === h.id).length, capacity: h.capacity, events: he.length, guests: he.reduce((x, e) => x + e.guests, 0) };
    if (money) { base.booked = he.reduce((x, e) => x + e.amount, 0); base.collected = he.reduce((x, e) => x + eventPaid(s, e), 0); }
    return base;
  });
  const out = {
    me: { id: user.id, name: user.name, nameAr: user.nameAr, role: user.role }, today, now,
    halls: s.halls, menus: s.menus, events, checklist, jobs, clients,
    reports: { byMonth, totals, perHall },
    insights,
    audit: user.role === 'manager' ? s.audit.slice(0, 120) : [],
  };
  if (money) out.payments = s.payments.slice(-200).reverse().map((p) => { const e = getEvent(s, p.eventId); return { ...p, code: e.code, clientName: cOf(e.clientId)?.name || '' }; });
  else out.payments = [];
  if (isCoord) {
    out.reports.byMonth = out.reports.byMonth.map((r) => ({ month: r.month, events: r.events, guests: r.guests, booked: 0, collected: 0 }));
    out.reports.totals = { ...out.reports.totals, bookedThisMonth: 0, collectedThisMonth: 0, outstanding: 0 };
    out.insights = out.insights.filter((i) => !['balance_near_event', 'refund_owed'].includes(i.kind));
  }
  if (isVendor) {
    out.jobs = jobs.filter((j) => j.vendorUserId === user.id).map((j) => { const { cost, ...rest } = j; return rest; });
    out.events = [];
    out.clients = [];
    out.checklist = [];
    out.payments = [];
    out.reports = { byMonth: [], totals: { vendorPending: out.jobs.filter((j) => j.status !== 'done').length, vendorDone: out.jobs.filter((j) => j.status === 'done').length }, perHall: [] };
    out.insights = [];
  }
  return out;
}

// ---------- deterministic seed ----------
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function seed(now) {
  const rand = mulberry32(20261125);
  const today = dayKey(now);
  const users = DEMO_USERS.map((u) => ({ ...u }));
  const clients = [
    ['Karim & Salma Abdelaziz', '01001234501'], ['Nourhan El-Sayed', '01001234502'], ['Mostafa & Hana Gomaa', '01001234503'],
    ['Yasmin Rauf', '01001234504'], ['Ahmed & Mariam Lotfy', '01001234505'], ['Tarek & Rania El-Husseini', '01001234506'],
    ['Habiba Nader', '01001234507'], ['Omar & Farida Shaheen', '01001234508'], ['Salma El-Baz', '01001234509'],
    ['Palm Hills Developments', '01001234510'],
  ].map(([name, phone], i) => ({ id: `cl${i + 1}`, name, phone, notes: '', createdAt: now - 400 * 864e5 }));
  const halls = [
    { id: 'h1', name: 'Grand Ballroom', kind: 'indoor', capacity: 600 },
    { id: 'h2', name: 'Jasmine Garden', kind: 'garden', capacity: 350 },
    { id: 'h3', name: 'Nile Roof', kind: 'roof', capacity: 180 },
  ];
  const menus = [
    { id: 'm1', name: 'Silver Open Buffet', tier: 'silver', perGuest: 450, createdAt: now - 400 * 864e5 },
    { id: 'm2', name: 'Gold Open Buffet', tier: 'gold', perGuest: 750, createdAt: now - 400 * 864e5 },
    { id: 'm3', name: 'Royal Banquet', tier: 'royal', perGuest: 1200, createdAt: now - 400 * 864e5 },
    { id: 'm4', name: 'Corporate Set Menu', tier: 'gold', perGuest: 600, createdAt: now - 400 * 864e5 },
  ];
  const s = { v: 1, users, clients, halls, menus, events: [], checklist: [], jobs: [], payments: [], counters: { eventNo: 0, e: 20, cl: 10 }, keys: [], audit: [] };
  const CHECK = ['Sign the venue contract', 'Approve the seating plan', 'Confirm the menu tasting', 'Brief the day coordinator', 'Final guest count'];
  const mkPays = (e, total, startAgo, endAgo) => {
    if (total <= 0) return;
    const n2 = total > 150000 ? 3 : total > 40000 ? 2 : 1;
    let left = total;
    for (let i = 0; i < n2; i++) {
      const amt = i === n2 - 1 ? left : Math.round((total / n2) / 100) * 100;
      left -= amt;
      const ago = Math.round(startAgo + (endAgo - startAgo) * (i / Math.max(1, n2 - 1)) * (0.7 + rand() * 0.3));
      s.payments.push({ id: nextId(s, 'pay'), eventId: e.id, method: ['cash', 'card', 'transfer'][Math.floor(rand() * 3)], amount: amt, date: addDays(today, -Math.max(0, ago)), by: 'u-finance', ts: now - ago * 864e5 });
    }
  };
  const mkEvent = (id, ci, hallId, menuId, dOff, guests, kind, status, paidPct, doneItems, createdAgo, jobsSpec = []) => {
    const m = menus.find((x) => x.id === menuId);
    const date = addDays(today, dOff);
    const e = { id, code: `FR-${String(++s.counters.eventNo).padStart(4, '0')}`, clientId: clients[ci].id, hallId, menuId, kind, date, guests, rate: m.perGuest, amount: m.perGuest * guests, status, notes: '', by: 'u-planner', createdAt: now - createdAgo * 864e5, confirmedAt: status === 'reserved' ? null : now - (createdAgo - 2) * 864e5 };
    s.events.push(e);
    CHECK.forEach((title, i) => s.checklist.push({ id: nextId(s, 'k'), eventId: id, title, done: i < doneItems, by: i < doneItems ? 'u-planner' : '', ts: now - Math.max(0, createdAgo - 5) * 864e5 }));
    mkPays(e, Math.round(e.amount * paidPct), createdAgo, Math.max(0, -dOff));
    for (const [kind2, vendorName, vendorUserId, cost, jstatus] of jobsSpec) s.jobs.push({ id: nextId(s, 'j'), eventId: id, kind: kind2, vendorName, vendorUserId, cost, status: jstatus, by: jstatus === 'assigned' ? '' : 'u-vendor', ts: now - 5 * 864e5 });
    return e;
  };
  // a year of completed events, one per month
  const hist = [
    ['h1', 'm3', 340, 500, 'wedding'], ['h2', 'm2', 328, 220, 'engagement'], ['h3', 'm2', 300, 150, 'katb'],
    ['h1', 'm2', 265, 380, 'wedding'], ['h2', 'm1', 235, 300, 'graduation'], ['h1', 'm3', 205, 450, 'wedding'],
    ['h3', 'm4', 176, 120, 'corporate'], ['h2', 'm2', 145, 250, 'wedding'], ['h1', 'm2', 115, 320, 'engagement'],
    ['h2', 'm1', 85, 280, 'katb'], ['h1', 'm3', 55, 520, 'wedding'],
  ];
  hist.forEach(([hallId, menuId, dAgo, guests, kind], i) => {
    const e = mkEvent(`eh${i}`, i % 10, hallId, menuId, -dAgo, guests, kind, 'completed', 1, 5, dAgo + 24, i % 3 === 0 ? [['photo', 'Moments Photography', 'u-vendor', 9000, 'done']] : []);
    e.confirmedAt = e.createdAt + 2 * 864e5;
  });
  // live board
  mkEvent('e12', 0, 'h2', 'm2', -2, 240, 'wedding', 'held', 1, 5, 40, [['photo', 'Moments Photography', 'u-vendor', 12000, 'done'], ['dj', 'DJ Zizo', null, 7000, 'done']]);
  mkEvent('e13', 1, 'h1', 'm3', 3, 420, 'wedding', 'confirmed', 0.6, 3, 30, [['photo', 'Moments Photography', 'u-vendor', 15000, 'accepted'], ['floral', 'Bloom Floral', null, 22000, 'accepted']]);
  mkEvent('e14', 2, 'h2', 'm2', 9, 200, 'engagement', 'reserved', 0, 1, 12);
  mkEvent('e15', 3, 'h3', 'm2', 18, 140, 'katb', 'reserved', 0.1, 2, 16);
  mkEvent('e16', 4, 'h1', 'm2', 30, 350, 'wedding', 'confirmed', 0.5, 4, 25, [['photo', 'Moments Photography', 'u-vendor', 15000, 'accepted']]);
  mkEvent('e17', 5, 'h2', 'm1', 45, 300, 'graduation', 'reserved', 0, 0, 10);
  mkEvent('e18', 6, 'h3', 'm4', 12, 150, 'corporate', 'confirmed', 1, 0, 20, [['cake', 'Sugar Crown Cakes', null, 6000, 'done'], ['photo', 'Moments Photography', 'u-vendor', 8000, 'accepted']]);
  mkEvent('e19', 7, 'h2', 'm3', 8, 320, 'wedding', 'confirmed', 0.4, 4, 22, [['photo', 'Moments Photography', 'u-vendor', 18000, 'assigned'], ['lights', 'Nile Lights', null, 14000, 'accepted']]);
  mkEvent('e20', 8, 'h1', 'm2', 25, 300, 'wedding', 'cancelled', 0.08, 1, 28);
  audit(s, users[0], now, 'seed', 'Farah demo agency loaded');
  return s;
}
