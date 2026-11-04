import type {
  Activity, Attachment, Comment, NewTask, Project, ProjectInput, Role, Session, Snapshot, Sprint, Task, TaskPatch, User,
} from '../types';

export type ServerEvent =
  | 'task.upserted' | 'task.deleted' | 'project.upserted' | 'project.deleted' | 'sprint.upserted' | 'sprint.deleted'
  | 'user.upserted' | 'comment.created' | 'attachment.created' | 'attachment.deleted' | 'activity.created'
  | 'notification.created' | 'presence';

export type EventHandler = (event: ServerEvent, payload: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Everything the UI can ask the server. Implemented by the demo (browser) and HTTP (NestJS) backends. */
export interface Backend {
  readonly mode: 'demo' | 'api';
  login(email: string, password: string): Promise<Session>;
  register(input: { workspaceName: string; name: string; email: string; password: string }): Promise<Session>;
  restore(token: string): Promise<Session>;
  logout(): void;
  bootstrap(): Promise<Snapshot>;

  createProject(input: ProjectInput): Promise<Project>;
  updateProject(id: string, input: ProjectInput): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  createSprint(projectId: string, input: Pick<Sprint, 'name' | 'goal' | 'startDate' | 'endDate'>): Promise<Sprint>;
  startSprint(id: string): Promise<Sprint>;
  completeSprint(id: string): Promise<{ sprint: Sprint; carriedOver: number }>;
  deleteSprint(id: string): Promise<void>;

  createTask(input: NewTask): Promise<Task>;
  updateTask(id: string, patch: TaskPatch): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  listComments(taskId: string): Promise<Comment[]>;
  addComment(taskId: string, body: string): Promise<Comment>;
  listAttachments(taskId: string): Promise<Attachment[]>;
  uploadAttachment(taskId: string, file: File): Promise<Attachment>;
  downloadAttachment(a: Attachment): Promise<void>;
  deleteAttachment(a: Attachment): Promise<void>;

  listActivity(filter?: { projectId?: string; taskId?: string; limit?: number }): Promise<Activity[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;

  inviteUser(input: { name: string; email: string; role: Role; title?: string; password: string }): Promise<User>;
  updateUser(id: string, input: Partial<Pick<User, 'role' | 'title' | 'capacity' | 'active'>>): Promise<User>;

  exportCsv(projectId?: string): Promise<Blob>;
  subscribe(handler: EventHandler): () => void;
}
