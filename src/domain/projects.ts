import type { AppData, Deadline } from './model.ts';
import { deadlineEndsAt } from './time.ts';

export function effectivePartners(data: AppData, deadline: Deadline): string[] {
  return deadline.project && deadline.partners === null
    ? data.projects[deadline.project]?.partners ?? []
    : deadline.partners ?? [];
}
export function canManageProject(data: AppData, projectId: string, userId: string): boolean {
  const user = data.people[userId], project = data.projects[projectId];
  return Boolean(user && project && (user.role !== 'lawyer' || project.createdBy === userId ||
    data.items.some(d => d.project === projectId && (d.assignees.includes(userId) || effectivePartners(data, d).includes(userId)))));
}
export function planProjectDeletion(data: AppData, projectId: string) {
  if (!data.projects[projectId]) throw new Error('Das Projekt existiert nicht mehr.');
  const members = data.items.filter(d => d.project === projectId), ids = new Set(members.map(d => d.id));
  return {
    members,
    open: members.filter(d => d.status !== 'Erledigt').sort((a, b) => deadlineEndsAt(a) - deadlineEndsAt(b)),
    external: data.items.filter(d => !ids.has(d.id) && d.parent && ids.has(d.parent)),
  };
}
export class OpenDeadlinesError extends Error {
  readonly deadlineIds: string[];
  constructor(deadlineIds: string[]) {
    super('Das Löschen der noch offenen Fristen muss ausdrücklich bestätigt werden.');
    this.name = 'OpenDeadlinesError';
    this.deadlineIds = deadlineIds;
  }
}
/** Applies one checked operation to the whole project, independent of the visible filter. */
export function deleteProject(data: AppData, projectId: string, options: {
  userId: string;
  deleteDeadlines: boolean;
  confirmedOpenIds?: string[];
  historyPrefix: string;
}) {
  if (!canManageProject(data, projectId, options.userId)) throw new Error('Keine Berechtigung für dieses Projekt.');
  const project = data.projects[projectId], plan = planProjectDeletion(data, projectId);
  const activeIds = plan.open.map(d => d.id).sort();
  if (options.deleteDeadlines && activeIds.length && JSON.stringify(activeIds) !== JSON.stringify([...(options.confirmedOpenIds ?? [])].sort())) {
    throw new OpenDeadlinesError(activeIds);
  }
  const removed = new Set(options.deleteDeadlines ? plan.members.map(d => d.id) : []);
  if (options.deleteDeadlines) {
    for (let i = data.items.length - 1; i >= 0; i--) if (removed.has(data.items[i]!.id)) data.items.splice(i, 1);
    for (const d of data.items) if (d.parent && removed.has(d.parent)) {
      delete d.parent;
      d.history.unshift(`${options.historyPrefix}: Verknüpfung zur gelöschten Bezugsfrist entfernt.`);
    }
    for (const [id, subscriptions] of Object.entries(data.subscriptions)) data.subscriptions[id] = subscriptions.filter(id => !removed.has(id));
  } else {
    for (const d of plan.members) {
      const partners = [...effectivePartners(data, d)];
      d.project = null;
      d.partners = partners;
      d.history.unshift(`${options.historyPrefix}: Projekt „${project!.name}“ gelöscht; Frist als eigenständiger Eintrag erhalten.`);
    }
  }
  for (const matter of Object.values(data.matters)) if (matter.project === projectId) matter.project = null;
  delete data.projects[projectId];
  return { deletedIds: [...removed], retainedCount: options.deleteDeadlines ? 0 : plan.members.length };
}
