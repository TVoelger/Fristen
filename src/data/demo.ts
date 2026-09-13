import seed from './seed.json' with { type: 'json' };
import type { AppData } from '../domain/model.ts';
import { dayAfter, dayNumber, todayInBerlin } from '../domain/time.ts';

/** Fictional cases, re-dated once on first start; persisted dates are never moved on reload. */
export function createDemoData(today = todayInBerlin()): AppData {
  const data = structuredClone(seed) as AppData;
  const offset = dayNumber(today) - dayNumber('2026-09-14');
  for (const deadline of data.items) {
    deadline.day = dayAfter(deadline.day, offset);
    if (deadline.preliminary) deadline.preliminary.day = dayAfter(deadline.preliminary.day, offset);
  }
  for (const settings of Object.values(data.assistantSettings)) if (settings.coverage) {
    settings.coverage.from = dayAfter(settings.coverage.from, offset);
    settings.coverage.until = dayAfter(settings.coverage.until, offset);
  }
  return data;
}
