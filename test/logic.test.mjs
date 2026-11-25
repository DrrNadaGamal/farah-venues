import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.js';

const NOW = Date.UTC(2026, 10, 26, 12); // noon UTC, Nov 26 2026
const fresh = () => L.seed(NOW);
const u = (s, role) => s.users.find((x) => x.role === role);
const run = (s, role, op) => L.applyOp(s, op, { user: u(s, role), now: NOW });
const runAt = (s, role, op, now) => L.applyOp(s, op, { user: u(s, role), now });
const viewFor = (s, role) => L.view(s, u(s, role), NOW);
const k = () => 'testkey' + Math.random().toString(36).slice(2, 8);

test('seed is internally consistent', () => {
  const s = fresh();
  assert.equal(s.clients.length, 10);
  assert.equal(s.halls.length, 3);
  assert.equal(s.menus.length, 4);
  assert.equal(s.events.length, 20);
  for (const e of s.events) {
    assert.ok(s.clients.some((c) => c.id === e.clientId), e.id + ' client');
    assert.ok(s.halls.some((h) => h.id === e.hallId), e.id + ' hall');
    assert.ok(s.menus.some((m) => m.id === e.menuId), e.id + ' menu');
    assert.equal(e.amount, e.rate * e.guests, e.id + ' amount');
  }
  // no hall double-booked on one date among active events
  const seen = new Set();
  for (const e of s.events) {
    if (['reserved', 'confirmed', 'held'].includes(e.status)) {
      const key = e.hallId + '|' + e.date;
      assert.ok(!seen.has(key), 'clash ' + key);
      seen.add(key);
    }
  }
  // payments never exceed the event amount
  for (const e of s.events) {
    const paid = s.payments.filter((p) => p.eventId === e.id).reduce((a, p) => a + p.amount, 0);
    assert.ok(paid <= e.amount, e.id + ' overpaid');
  }
  // every report month has activity
  const v = viewFor(s, 'manager');
  assert.ok(v.reports.byMonth.every((m) => m.events + m.booked + m.collected > 0), 'empty month');
  assert.equal(v.reports.byMonth.length, 12);
  // all six insight kinds fire
  const kinds = new Set(v.insights.map((i) => i.kind));
  for (const kk of ['event_soon', 'deposit_missing', 'balance_near_event', 'checklist_open', 'vendor_pending', 'refund_owed']) assert.ok(kinds.has(kk), kk);
});

test('addEvent validates and snapshots the rate', () => {
  const s = fresh();
  const date = '2026-12-20';
  assert.throws(() => run(s, 'manager', { type: 'addEvent', idem: k(), clientId: 'cl1', hallId: 'h1', menuId: 'm1', kind: 'wedding', date: '2026-11-20', guests: 100 }), /future/);
  assert.throws(() => run(s, 'manager', { type: 'addEvent', idem: k(), clientId: 'cl1', hallId: 'h1', menuId: 'm1', kind: 'wedding', date, guests: 10 }), /Guests/);
  assert.throws(() => run(s, 'manager', { type: 'addEvent', idem: k(), clientId: 'cl1', hallId: 'h1', menuId: 'm1', kind: 'wedding', date, guests: 700 }), /Guests/);
  const r = run(s, 'planner', { type: 'addEvent', idem: k(), clientId: 'cl1', hallId: 'h3', menuId: 'm2', kind: 'engagement', date, guests: 150 });
  const e = s.events.find((x) => x.id === r.eventId);
  assert.equal(e.rate, 750);
  assert.equal(e.amount, 150 * 750);
  assert.equal(e.status, 'reserved');
  assert.equal(e.code, 'FR-0021');
  assert.equal(s.checklist.filter((c) => c.eventId === e.id).length, 5);
  // hall clash
  assert.throws(() => run(s, 'manager', { type: 'addEvent', idem: k(), clientId: 'cl2', hallId: 'h3', menuId: 'm1', kind: 'wedding', date, guests: 100 }), /already booked/);
  // coordinator cannot book
  assert.throws(() => run(s, 'coordinator', { type: 'addEvent', idem: k(), clientId: 'cl2', hallId: 'h1', menuId: 'm1', kind: 'wedding', date: '2026-12-22', guests: 100 }), /Not allowed/);
});

test('idempotency key replays as duplicate', () => {
  const s = fresh();
  const op = { type: 'addEvent', key: k(), clientId: 'cl1', hallId: 'h1', menuId: 'm1', kind: 'wedding', date: '2026-12-21', guests: 200 };
  const a = run(s, 'manager', op);
  const n = s.events.length;
  const b = run(s, 'manager', op);
  assert.equal(s.events.length, n);
  assert.equal(b.duplicate, true);
  assert.ok(a.eventId);
  assert.throws(() => run(s, 'manager', { type: 'addEvent', key: 'abc', clientId: 'cl1', hallId: 'h1', menuId: 'm1', kind: 'wedding', date: '2026-12-22', guests: 100 }), /Bad request/);
});

test('every create op returns the new id and audits', () => {
  const s = fresh();
  const a = run(s, 'manager', { type: 'addEvent', clientId: 'cl1', hallId: 'h1', menuId: 'm1', kind: 'wedding', date: '2026-12-21', guests: 200 });
  assert.ok(a.eventId);
  assert.ok(s.events.some((e) => e.id === a.eventId));
  assert.equal(s.audit[0].action, 'addEvent');
});

test('confirm requires 30% paid', () => {
  const s = fresh();
  // e14: reserved, unpaid
  assert.throws(() => run(s, 'manager', { type: 'confirmEvent', eventId: 'e14' }), /30%/);
  run(s, 'finance', { type: 'addPayment', idem: k(), eventId: 'e14', amount: 45000, method: 'cash' }); // 30% of 150000
  run(s, 'planner', { type: 'confirmEvent', eventId: 'e14' });
  assert.equal(s.events.find((e) => e.id === 'e14').status, 'confirmed');
  // already confirmed cannot re-confirm
  assert.throws(() => run(s, 'manager', { type: 'confirmEvent', eventId: 'e14' }), /reserved/);
});

test('payment rules: overpay, future date, roles', () => {
  const s = fresh();
  assert.throws(() => run(s, 'finance', { type: 'addPayment', idem: k(), eventId: 'e14', amount: 150001, method: 'card' }), /more than the balance/);
  assert.throws(() => run(s, 'finance', { type: 'addPayment', idem: k(), eventId: 'e14', amount: 100, method: 'card', date: '2027-01-01' }), /future/);
  assert.throws(() => run(s, 'planner', { type: 'addPayment', idem: k(), eventId: 'e14', amount: 100, method: 'card' }), /Not allowed/);
  assert.throws(() => run(s, 'finance', { type: 'addPayment', idem: k(), eventId: 'e20', amount: 100, method: 'card' }), /no longer active/);
  const r = run(s, 'finance', { type: 'addPayment', idem: k(), eventId: 'e14', amount: 10000, method: 'transfer' });
  assert.ok(r.paymentId);
});

test('held and complete flow respects dates, balance and checklist', () => {
  const s = fresh();
  // e13 confirmed, date 2026-11-29 (future): cannot mark held yet
  assert.throws(() => run(s, 'manager', { type: 'markHeld', eventId: 'e13' }), /not passed/);
  // e14 reserved: cannot mark held
  assert.throws(() => run(s, 'manager', { type: 'markHeld', eventId: 'e14' }), /confirmed/);
  // e12 held, fully paid, checklist done: completes
  run(s, 'manager', { type: 'completeEvent', eventId: 'e12' });
  assert.equal(s.events.find((e) => e.id === 'e12').status, 'completed');
  // full happy path on a fresh event with time travel
  const made = run(s, 'manager', { type: 'addEvent', idem: k(), clientId: 'cl2', hallId: 'h1', menuId: 'm1', kind: 'corporate', date: '2026-12-15', guests: 100 });
  const eid = made.eventId;
  const ev = s.events.find((e) => e.id === eid);
  run(s, 'manager', { type: 'addPayment', idem: k(), eventId: eid, amount: ev.amount, method: 'card' });
  run(s, 'manager', { type: 'confirmEvent', eventId: eid });
  for (const c of s.checklist.filter((c2) => c2.eventId === eid)) run(s, 'planner', { type: 'toggleChecklist', itemId: c.id });
  const after = Date.parse('2026-12-16T00:00:00Z');
  runAt(s, 'manager', { type: 'markHeld', eventId: eid }, after);
  runAt(s, 'manager', { type: 'completeEvent', eventId: eid }, after);
  assert.equal(ev.status, 'completed');
  assert.throws(() => runAt(s, 'manager', { type: 'cancelEvent', eventId: eid }, after), /completed/);
});

test('cancel flags a refund when paid', () => {
  const s = fresh();
  run(s, 'manager', { type: 'addPayment', idem: k(), eventId: 'e14', amount: 20000, method: 'cash' });
  run(s, 'manager', { type: 'cancelEvent', eventId: 'e14' });
  const e = s.events.find((x) => x.id === 'e14');
  assert.equal(e.status, 'cancelled');
  const ri = viewFor(s, 'manager').insights.find((i) => i.kind === 'refund_owed' && i.eventId === 'e14');
  assert.equal(ri.amount, 20000);
  assert.throws(() => run(s, 'manager', { type: 'cancelEvent', eventId: 'e14' }), /already cancelled/);
  // cancelling frees the hall date
  const r = run(s, 'manager', { type: 'addEvent', idem: k(), clientId: 'cl3', hallId: 'h2', menuId: 'm2', kind: 'wedding', date: '2026-12-05', guests: 200 });
  assert.ok(r.eventId);
});

test('checklist add and toggle with roles', () => {
  const s = fresh();
  const r = run(s, 'planner', { type: 'addChecklist', idem: k(), eventId: 'e13', title: 'Extra sound check' });
  assert.ok(r.itemId);
  const item = s.checklist.find((c) => c.id === r.itemId);
  assert.equal(item.done, false);
  assert.throws(() => run(s, 'finance', { type: 'toggleChecklist', itemId: item.id }), /Not allowed/);
  run(s, 'planner', { type: 'toggleChecklist', itemId: item.id });
  assert.equal(item.done, true);
  run(s, 'manager', { type: 'toggleChecklist', itemId: item.id });
  assert.equal(item.done, false);
});

test('vendor jobs: assign, forward-only stages, vendor scope', () => {
  const s = fresh();
  const r = run(s, 'manager', { type: 'assignVendor', idem: k(), eventId: 'e13', kind: 'dj', vendorName: 'DJ Kimo', vendorUserId: 'u-vendor', cost: 12000 });
  const job = s.jobs.find((j) => j.id === r.jobId);
  assert.equal(job.status, 'assigned');
  run(s, 'vendor', { type: 'updateVendorJob', jobId: job.id, status: 'accepted' });
  assert.equal(job.status, 'accepted');
  assert.equal(job.by, 'u-vendor');
  run(s, 'vendor', { type: 'updateVendorJob', jobId: job.id, status: 'done' });
  assert.equal(job.status, 'done');
  // jobs only move forward
  assert.throws(() => run(s, 'vendor', { type: 'updateVendorJob', jobId: job.id, status: 'assigned' }), /forward/);
  // vendor cannot touch a job assigned to a different account
  const other = run(s, 'manager', { type: 'assignVendor', idem: k(), eventId: 'e13', kind: 'floral', vendorName: 'Rose House', cost: 8000 });
  assert.throws(() => run(s, 'vendor', { type: 'updateVendorJob', jobId: other.jobId, status: 'accepted' }), /Not your job/);
});

test('views: coordinator is money-blind, vendor sees only own jobs, audit manager-only', () => {
  const s = fresh();
  const cv = viewFor(s, 'coordinator');
  for (const e of cv.events) {
    assert.ok(!('rate' in e) && !('amount' in e), 'coordinator rate/amount');
    assert.ok(e.paid === 0 && e.balance === 0 && e.vendorSpend === 0, 'coordinator money zeroed');
  }
  assert.equal(cv.payments.length, 0);
  assert.ok(cv.reports.byMonth.every((m) => m.booked === 0 && m.collected === 0));
  assert.ok(!cv.insights.some((i) => i.kind === 'balance_near_event' || i.kind === 'refund_owed'));
  for (const c of cv.clients) assert.ok(!('booked' in c) && !('paid' in c), 'coordinator client money');
  const vv = viewFor(s, 'vendor');
  assert.ok(vv.jobs.length > 0);
  for (const j of vv.jobs) assert.ok(!('cost' in j), 'vendor cost');
  assert.equal(vv.events.length, 0);
  assert.equal(vv.clients.length, 0);
  assert.equal(vv.checklist.length, 0);
  assert.equal(vv.payments.length, 0);
  assert.equal(vv.insights.length, 0);
  assert.equal(vv.audit.length, 0);
  const mv = viewFor(s, 'manager');
  assert.ok(mv.audit.length > 0);
  const fv = viewFor(s, 'finance');
  assert.equal(fv.audit.length, 0);
});

test('halls, menus and clients are manager-editable', () => {
  const s = fresh();
  run(s, 'manager', { type: 'updateHall', hallId: 'h1', name: 'Grand Ballroom East', capacity: 650 });
  assert.equal(s.halls.find((h) => h.id === 'h1').capacity, 650);
  assert.throws(() => run(s, 'planner', { type: 'updateHall', hallId: 'h1', name: 'X', capacity: 10 }), /Not allowed/);
  const r = run(s, 'manager', { type: 'addMenu', idem: k(), name: 'Diamond', tier: 'royal', perGuest: 1500 });
  assert.ok(r.menuId);
  run(s, 'manager', { type: 'updateMenu', menuId: r.menuId, name: 'Diamond Plus', perGuest: 1600 });
  assert.equal(s.menus.find((m) => m.id === r.menuId).perGuest, 1600);
  const c = run(s, 'planner', { type: 'addClient', idem: k(), name: 'New Client', phone: '01000000000' });
  assert.ok(c.clientId);
  run(s, 'manager', { type: 'updateClient', clientId: c.clientId, name: 'New Client', phone: '01111111111', notes: 'VIP' });
  assert.equal(s.clients.find((x) => x.id === c.clientId).phone, '01111111111');
});

test('audit trail records ops', () => {
  const s = fresh();
  const before = s.audit.length;
  run(s, 'manager', { type: 'addPayment', idem: k(), eventId: 'e14', amount: 5000, method: 'cash' });
  assert.ok(s.audit.length > before);
  assert.equal(s.audit[0].action, 'addPayment');
});
