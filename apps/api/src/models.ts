export type Role = 'ADMIN' | 'MANAGER' | 'MEMBER';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
export interface User { id: string; name: string; email: string; role: Role; avatar: string; }
export interface Task { id: string; title: string; projectId: string; assigneeId?: string; status: TaskStatus; priority: 'HIGH'|'MEDIUM'|'LOW'; dueDate: string; progress: number; risk: 'HIGH'|'MEDIUM'|'LOW'; sourceMeetingId?: string; blocked?: boolean; }
export interface Meeting { id: string; projectId: string; title: string; date: string; attendees: string[]; content: string; status: 'DRAFT'|'ANALYZING'|'REVIEW_REQUIRED'|'CONFIRMED'; }
export interface Candidate { id: string; type: 'TASK'|'DECISION'; title: string; description: string; assigneeName?: string; dueDate?: string; priority?: 'HIGH'|'MEDIUM'|'LOW'; confidence: number; evidence: string; status: 'PENDING'|'CONFIRMED'|'REJECTED'; }
export interface Analysis { meetingId: string; summary: string; topics: string[]; nextSteps: string[]; citations: { label: string; text: string; start: number }[]; candidates: Candidate[]; trace: { step: string; status: string; durationMs: number }[]; }
