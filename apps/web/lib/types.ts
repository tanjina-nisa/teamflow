export type Role = 'ADMIN' | 'PM' | 'DEVELOPER' | 'TESTER';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskType = 'FEATURE' | 'BUG' | 'CHORE';
export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED';

export const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
export const STATUS_LABEL: Record<TaskStatus, string> = { TODO: 'To Do', IN_PROGRESS: 'In Progress', REVIEW: 'Review', DONE: 'Done' };
export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', PM: 'Project Manager', DEVELOPER: 'Developer', TESTER: 'Tester' };
export const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export interface Workspace { id: string; name: string; slug: string; createdAt: string }

export interface User {
  id: string; workspaceId: string; name: string; email: string; role: Role; title: string;
  color: string; capacity: number; active: boolean; createdAt: string;
}

export interface Project {
  id: string; workspaceId: string; key: string; name: string; description: string; color: string;
  status: ProjectStatus; startDate: string | null; dueDate: string | null; ownerId: string | null;
  taskSeq: number; memberIds: string[]; createdAt: string;
}

export interface Sprint {
  id: string; projectId: string; name: string; goal: string; startDate: string; endDate: string;
  status: SprintStatus; createdAt: string;
}

export interface Task {
  id: string; workspaceId: string; projectId: string; sprintId: string | null; number: number;
  title: string; description: string; status: TaskStatus; priority: Priority; type: TaskType;
  assigneeId: string | null; reporterId: string | null; points: number; dueDate: string | null;
  order: number; labels: string[]; completedAt: string | null; createdAt: string; updatedAt: string;
}

export interface Comment { id: string; taskId: string; authorId: string; body: string; createdAt: string }

export interface Attachment {
  id: string; taskId: string; uploaderId: string; filename: string; mimeType: string; size: number;
  createdAt: string; dataUrl?: string;
}

export interface Activity {
  id: string; workspaceId: string; projectId: string | null; taskId: string | null; actorId: string | null;
  action: string; message: string; meta: Record<string, unknown>; createdAt: string;
}

export interface Notification {
  id: string; userId: string; type: string; title: string; body: string; link: string; read: boolean; createdAt: string;
}

export interface Session { token: string; user: User; workspace: Workspace }

export interface Snapshot {
  workspace: Workspace; users: User[]; projects: Project[]; sprints: Sprint[]; tasks: Task[]; notifications: Notification[];
}

export type NewTask = Partial<Omit<Task, 'id' | 'number' | 'workspaceId'>> & { projectId: string; title: string };
export type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'type' | 'assigneeId' | 'sprintId' | 'points' | 'dueDate' | 'labels' | 'order'>>;
export type ProjectInput = Partial<Pick<Project, 'name' | 'key' | 'description' | 'color' | 'status' | 'startDate' | 'dueDate' | 'memberIds'>>;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
