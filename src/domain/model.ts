export type Role = 'assistant' | 'lawyer' | 'partner';
export type DeadlineKind = 'internal' | 'urgency' | 'enforcement' | 'pleading';
export type DeadlineStatus = 'Offen' | 'Erledigungskontrolle offen' | 'Erledigt';

export interface Person { name: string; initials: string; role: Role }
export interface Project { name: string; partners: string[]; history: string[]; createdBy?: string }
export interface Matter { name: string; short: string; code: string; court: string; project: string | null }
export interface Deadline {
  id: string;
  title: string;
  matter: string;
  project: string | null;
  kind: DeadlineKind;
  notfrist: boolean;
  day: string;
  time: string;
  assignees: string[];
  /** null means the current project partners are inherited. */
  partners: string[] | null;
  status: DeadlineStatus;
  verified: boolean;
  calendar: string;
  source: string;
  history: string[];
  parent?: string;
  evidence?: string;
  preliminary?: { day: string; done?: boolean };
}
export interface AssistantSettings {
  lawyers: string[];
  coverage: { deputy: string; from: string; until: string } | null;
}
export interface AppData {
  schemaVersion: 1;
  activeUser: string;
  nextDeadlineId: number;
  people: Record<string, Person>;
  projects: Record<string, Project>;
  matters: Record<string, Matter>;
  items: Deadline[];
  userSettings: Record<string, { weeks: number; nameDisplay: 'initials' | 'full' }>;
  assistantSettings: Record<string, AssistantSettings>;
  subscriptions: Record<string, string[]>;
}
