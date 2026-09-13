import type { AppData } from '../domain/model.ts';
import { validDay, deadlineEndsAt } from '../domain/time.ts';

export const STORAGE_KEY = 'fristen.workspace.v1';
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown) => typeof value === 'string';
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
function requireData(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Ungültiger Arbeitsstand: ${message}`);
}
export function validateData(value: unknown): asserts value is AppData {
  requireData(record(value) && value.schemaVersion === 1, 'Formatversion');
  for (const key of ['people', 'projects', 'matters', 'userSettings', 'assistantSettings', 'subscriptions']) requireData(record(value[key]), key);
  const data = value as unknown as AppData;
  requireData(Array.isArray(data.items), 'Fristen');
  requireData(text(data.activeUser) && Object.hasOwn(data.people, data.activeUser), 'Benutzer');
  requireData(Number.isSafeInteger(data.nextDeadlineId) && data.nextDeadlineId > 0, 'Fristkennung');
  const personIds = new Set(Object.keys(data.people));
  const deadlineIds = new Set(data.items.map(d => d?.id));
  requireData(deadlineIds.size === data.items.length, 'doppelte Fristkennung');
  for (const map of [data.people, data.projects, data.matters, data.userSettings, data.assistantSettings, data.subscriptions]) {
    requireData(!['__proto__', 'constructor', 'prototype'].some(key => Object.hasOwn(map, key)), 'reservierte Kennung');
    requireData(Object.keys(map).every(key => /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(key)), 'Kennungsformat');
  }
  for (const [id, person] of Object.entries(data.people)) {
    requireData(person && text(person.name) && text(person.initials) && ['assistant', 'lawyer', 'partner'].includes(person.role), 'Person');
    const settings = data.userSettings[id], subscriptions = data.subscriptions[id];
    requireData(settings && Number.isSafeInteger(settings.weeks) && settings.weeks >= 1 && ['initials', 'full'].includes(settings.nameDisplay), 'Einstellungen');
    requireData(strings(subscriptions) && subscriptions.every(id => deadlineIds.has(id)), 'Abonnements');
    if (person.role === 'assistant') {
      const support = data.assistantSettings[id];
      requireData(support && strings(support.lawyers) && support.lawyers.every(id => personIds.has(id) && data.people[id]!.role !== 'assistant'), 'Betreuung');
      if (support.coverage) requireData(personIds.has(support.coverage.deputy) && support.coverage.deputy !== id && validDay(support.coverage.from) && validDay(support.coverage.until) && support.coverage.from <= support.coverage.until, 'Vertretung');
    }
  }
  const validPartners = (ids: unknown) => strings(ids) && ids.length > 0 && ids.every(id => data.people[id]?.role === 'partner');
  for (const project of Object.values(data.projects)) requireData(project && text(project.name) && project.name.trim() && validPartners(project.partners) && strings(project.history) && (!project.createdBy || personIds.has(project.createdBy)), 'Projekt');
  for (const matter of Object.values(data.matters)) requireData(matter && text(matter.name) && text(matter.short) && text(matter.code) && text(matter.court) && (matter.project === null || Object.hasOwn(data.projects, matter.project)), 'Verfahren');
  for (const d of data.items) {
    requireData(d && text(d.id) && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(d.id) && text(d.title) && Object.hasOwn(data.matters, d.matter), 'Fristeintrag');
    requireData(d.project === null || Object.hasOwn(data.projects, d.project), 'Projektzuordnung');
    requireData(strings(d.assignees) && d.assignees.length > 0 && d.assignees.every(id => personIds.has(id) && data.people[id]!.role !== 'assistant'), 'Zuständigkeit');
    requireData(d.partners === null ? Boolean(d.project) : validPartners(d.partners), 'Partnerzuordnung');
    requireData(['internal', 'urgency', 'enforcement', 'pleading'].includes(d.kind) && typeof d.notfrist === 'boolean', 'Kennzeichnung');
    requireData(!d.notfrist || d.kind === 'pleading', 'Notfristkennzeichnung');
    requireData(['Offen', 'Erledigungskontrolle offen', 'Erledigt'].includes(d.status) && typeof d.verified === 'boolean', 'Bearbeitungsstand');
    requireData(text(d.time) && Number.isFinite(deadlineEndsAt(d)) && text(d.source) && text(d.calendar) && strings(d.history), 'Fristdaten');
    requireData(!d.parent || (deadlineIds.has(d.parent) && d.parent !== d.id), 'Bezugsfrist');
    requireData(!d.preliminary || (validDay(d.preliminary.day) && d.preliminary.day < d.day && (d.preliminary.done === undefined || typeof d.preliminary.done === 'boolean')), 'interne Vorfrist');
    requireData(d.evidence === undefined || text(d.evidence), 'Erledigungsvermerk');
  }
  const highestId = Math.max(0, ...data.items.map(d => /^f\d+$/.test(d.id) ? Number(d.id.slice(1)) : 0));
  requireData(data.nextDeadlineId > highestId, 'bereits verwendete Fristkennung');
}

/** One replaceable persistence boundary; no credentials or Outlook tokens are stored here. */
export class LocalRepository {
  private lastRaw: string | null = null;
  private storage: StoragePort;
  constructor(storage: StoragePort) { this.storage = storage; }
  load(initial: () => AppData): AppData {
    const raw = this.storage.getItem(STORAGE_KEY);
    const data: unknown = raw === null ? initial() : JSON.parse(raw);
    validateData(data);
    this.lastRaw = raw;
    return data;
  }
  save(data: AppData): void {
    validateData(data);
    const raw = JSON.stringify(data);
    if (raw === this.lastRaw) return;
    if (this.storage.getItem(STORAGE_KEY) !== this.lastRaw) throw new Error('Der Arbeitsstand wurde in einem anderen Fenster geändert. Bitte neu laden, bevor du weiterarbeitest.');
    this.storage.setItem(STORAGE_KEY, raw);
    this.lastRaw = raw;
  }
}
