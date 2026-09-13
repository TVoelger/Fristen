import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoData } from '../src/data/demo.ts';
import { deleteProject, planProjectDeletion, effectivePartners, canManageProject, OpenDeadlinesError } from '../src/domain/projects.ts';
import { berlinTimestamp, deadlineEndsAt, todayInBerlin, validDay } from '../src/domain/time.ts';
import { LocalRepository, STORAGE_KEY, validateData } from '../src/data/storage.ts';

const fixture = () => createDemoData('2026-09-14');
const options = { userId: 'clara', historyPrefix: '14.09.2026 · ClB' };
const memory = () => ({ values: new Map(), getItem(key) { return this.values.get(key) ?? null; }, setItem(key, value) { this.values.set(key, value); } });

test('project deletion retains all deadlines and their effective partner assignments by default', () => {
  const data = fixture(), before = structuredClone(data), plan = planProjectDeletion(data, 'meridian');
  data.items.find(d => d.id === 'f1').status = 'Erledigt';
  const result = deleteProject(data, 'meridian', { ...options, deleteDeadlines: false });
  assert.equal(result.retainedCount, plan.members.length);
  assert.equal(data.items.length, before.items.length);
  assert.equal(data.projects.meridian, undefined);
  for (const original of before.items.filter(d => d.project === 'meridian')) {
    const current = data.items.find(d => d.id === original.id);
    assert.equal(current.project, null);
    assert.deepEqual(current.partners, effectivePartners(before, original));
    assert.deepEqual(current.assignees, original.assignees);
    assert.equal(current.day, original.day);
    assert.equal(current.parent, original.parent);
    assert.deepEqual(current.preliminary, original.preliminary);
  }
  assert.deepEqual(data.subscriptions, before.subscriptions);
  assert.equal(data.matters.m1.project, null);
  validateData(data);
});

test('cascade deletion refuses unconfirmed open deadlines and changes nothing', () => {
  const data = fixture();
  data.items.find(d => d.id === 'f1').status = 'Erledigungskontrolle offen';
  const before = JSON.stringify(data);
  assert.throws(() => deleteProject(data, 'meridian', { ...options, deleteDeadlines: true }), OpenDeadlinesError);
  assert.equal(JSON.stringify(data), before);
});

test('cascade confirmation must cover all current open deadlines, including hidden ones', () => {
  const data = fixture(), ids = planProjectDeletion(data, 'meridian').open.map(d => d.id);
  assert(ids.includes('f1'));
  assert.throws(() => deleteProject(data, 'meridian', { ...options, deleteDeadlines: true, confirmedOpenIds: ids.filter(id => id !== 'f1') }), OpenDeadlinesError);
  data.subscriptions.clara.push('f1', 'f7');
  const result = deleteProject(data, 'meridian', { ...options, deleteDeadlines: true, confirmedOpenIds: ids });
  assert.equal(result.deletedIds.length, 5);
  assert.deepEqual(data.items.map(d => d.id), ['f4', 'f5', 'f6', 'f9']);
  assert.deepEqual(data.subscriptions.clara, ['f4']);
  validateData(data);
});

test('a linked deadline outside the deleted project is retained and detached', () => {
  const data = fixture(), outside = data.items.find(d => d.id === 'f2');
  outside.project = null; outside.partners = ['felix'];
  const plan = planProjectDeletion(data, 'meridian');
  assert.deepEqual(plan.external.map(d => d.id), ['f2']);
  deleteProject(data, 'meridian', { ...options, deleteDeadlines: true, confirmedOpenIds: plan.open.map(d => d.id) });
  assert(data.items.includes(outside));
  assert.equal(outside.parent, undefined);
  assert.equal(outside.day, '2026-09-15');
  validateData(data);
});

test('a project with only completed deadlines needs no open-deadline confirmation', () => {
  const data = fixture();
  for (const d of data.items.filter(d => d.project === 'meridian')) d.status = 'Erledigt';
  assert.equal(planProjectDeletion(data, 'meridian').open.length, 0);
  deleteProject(data, 'meridian', { ...options, deleteDeadlines: true });
  validateData(data);
});

test('an empty project can be removed and subscriptions never grant editing rights', () => {
  const data = fixture();
  data.projects.empty = { name: 'Leeres Projekt', partners: ['felix'], history: [], createdBy: 'till' };
  assert(canManageProject(data, 'empty', 'till'));
  deleteProject(data, 'empty', { ...options, userId: 'till', deleteDeadlines: false });
  data.subscriptions.till.push('f6');
  assert(!canManageProject(data, 'nordlicht', 'till'));
  assert.throws(() => deleteProject(data, 'nordlicht', { ...options, userId: 'till', deleteDeadlines: false }), /Berechtigung/);
});

test('inherited responsibility is live, while a deadline override remains independent', () => {
  const data = fixture(), inherited = data.items.find(d => d.id === 'f3'), overridden = data.items.find(d => d.id === 'f7');
  data.projects.meridian.partners = ['mara'];
  assert.deepEqual(effectivePartners(data, inherited), ['mara']);
  data.projects.meridian.partners = ['felix'];
  assert.deepEqual(effectivePartners(data, inherited), ['felix']);
  assert.deepEqual(effectivePartners(data, overridden), ['mara']);
});

test('Berlin deadline boundaries handle daylight saving transitions', () => {
  assert.equal(new Date(berlinTimestamp('2026-07-01', '12:00')).toISOString(), '2026-07-01T10:00:00.000Z');
  assert.equal(new Date(berlinTimestamp('2026-12-01', '12:00')).toISOString(), '2026-12-01T11:00:00.000Z');
  assert.equal((deadlineEndsAt({ day: '2026-03-29', time: 'day' }) - berlinTimestamp('2026-03-29', '00:00')) / 3_600_000, 23);
  assert.equal((deadlineEndsAt({ day: '2026-10-25', time: 'day' }) - berlinTimestamp('2026-10-25', '00:00')) / 3_600_000, 25);
  assert(Number.isNaN(berlinTimestamp('2026-03-29', '02:30')));
  assert.equal(new Date(berlinTimestamp('2026-10-25', '02:30')).toISOString(), '2026-10-25T00:30:00.000Z');
  assert.equal(todayInBerlin(Date.parse('2026-09-13T22:30:00Z')), '2026-09-14');
  assert(!validDay('2026-02-29'));
  assert(Number.isNaN(deadlineEndsAt({ day: 'bad', time: 'day' })));
});

test('local changes, settings and subscriptions survive reloading without re-dating', () => {
  const storage = memory(), repository = new LocalRepository(storage), data = repository.load(fixture);
  data.projects.meridian.name = 'Neuer Projektname';
  data.userSettings.clara.weeks = 12; data.subscriptions.clara.push('f5');
  repository.save(data);
  const restored = new LocalRepository(storage).load(() => createDemoData('2027-01-01'));
  assert.deepEqual(restored, data);
  assert.equal(restored.items[0].day, '2026-09-14');
});

test('corrupt or incompatible storage is rejected without overwriting it', () => {
  const storage = memory(); storage.setItem(STORAGE_KEY, '{bad json');
  assert.throws(() => new LocalRepository(storage).load(fixture));
  assert.equal(storage.getItem(STORAGE_KEY), '{bad json');
  const broken = fixture(); broken.items.push(broken.items[0]);
  assert.throws(() => validateData(broken), /doppelte/);
});

test('a stale local window cannot silently overwrite a newer saved state', () => {
  const storage = memory(), first = new LocalRepository(storage), data = first.load(fixture); first.save(data);
  const second = new LocalRepository(storage), newer = second.load(fixture);
  newer.projects.meridian.name = 'Neu im anderen Fenster'; second.save(newer);
  data.projects.meridian.name = 'Veraltete Änderung';
  assert.throws(() => first.save(data), /anderen Fenster/);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).projects.meridian.name, 'Neu im anderen Fenster');
});
