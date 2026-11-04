import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const ROLES = ['ADMIN', 'PM', 'DEVELOPER', 'TESTER'] as const;
export type Role = (typeof ROLES)[number];

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_TYPES = ['FEATURE', 'BUG', 'CHORE'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const PROJECT_STATUSES = ['ACTIVE', 'ON_HOLD', 'COMPLETED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const SPRINT_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED'] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

/** A company using TeamFlow. Every row below belongs to exactly one workspace (multi-tenant). */
@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Index({ unique: true }) @Column() slug: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') workspaceId: string;
  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'workspaceId' }) workspace: Workspace;
  @Column() name: string;
  @Index({ unique: true }) @Column() email: string;
  @Column({ select: false }) passwordHash: string;
  @Column({ type: 'varchar', default: 'DEVELOPER' }) role: Role;
  @Column({ default: '' }) title: string;
  @Column({ default: '#6366f1' }) color: string;
  @Column({ type: 'int', default: 30 }) capacity: number; // story points per sprint
  @Column({ default: true }) active: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') workspaceId: string;
  @Column() key: string; // e.g. "WEB" → tasks WEB-12
  @Column() name: string;
  @Column({ type: 'text', default: '' }) description: string;
  @Column({ default: '#6366f1' }) color: string;
  @Column({ type: 'varchar', default: 'ACTIVE' }) status: ProjectStatus;
  @Column({ type: 'date', nullable: true }) startDate: string | null;
  @Column({ type: 'date', nullable: true }) dueDate: string | null;
  @Column('uuid', { nullable: true }) ownerId: string | null;
  @Column({ type: 'int', default: 0 }) taskSeq: number;
  @ManyToMany(() => User) @JoinTable({ name: 'project_members' }) members: User[];
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('sprints')
export class Sprint {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') projectId: string;
  @ManyToOne(() => Project, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'projectId' }) project: Project;
  @Column() name: string;
  @Column({ type: 'text', default: '' }) goal: string;
  @Column({ type: 'date' }) startDate: string;
  @Column({ type: 'date' }) endDate: string;
  @Column({ type: 'varchar', default: 'PLANNED' }) status: SprintStatus;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') workspaceId: string;
  @Index() @Column('uuid') projectId: string;
  @ManyToOne(() => Project, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'projectId' }) project: Project;
  @Index() @Column('uuid', { nullable: true }) sprintId: string | null;
  @ManyToOne(() => Sprint, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'sprintId' }) sprint: Sprint | null;
  @Column({ type: 'int' }) number: number;
  @Column() title: string;
  @Column({ type: 'text', default: '' }) description: string;
  @Index() @Column({ type: 'varchar', default: 'TODO' }) status: TaskStatus;
  @Column({ type: 'varchar', default: 'MEDIUM' }) priority: Priority;
  @Column({ type: 'varchar', default: 'FEATURE' }) type: TaskType;
  @Index() @Column('uuid', { nullable: true }) assigneeId: string | null;
  @Column('uuid', { nullable: true }) reporterId: string | null;
  @Column({ type: 'int', default: 1 }) points: number;
  @Column({ type: 'date', nullable: true }) dueDate: string | null;
  @Column({ type: 'double precision', default: 0 }) order: number;
  @Column({ type: 'text', array: true, default: '{}' }) labels: string[];
  @Column({ type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) reminderSentAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @OneToMany(() => Comment, (c) => c.task) comments: Comment[];
}

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') taskId: string;
  @ManyToOne(() => Task, (t) => t.comments, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'taskId' }) task: Task;
  @Column('uuid') authorId: string;
  @Column({ type: 'text' }) body: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') taskId: string;
  @ManyToOne(() => Task, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'taskId' }) task: Task;
  @Column('uuid') uploaderId: string;
  @Column() filename: string;
  @Column() mimeType: string;
  @Column({ type: 'int' }) size: number;
  @Column() storageKey: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') workspaceId: string;
  @Index() @Column('uuid', { nullable: true }) projectId: string | null;
  @Column('uuid', { nullable: true }) taskId: string | null;
  @Column('uuid', { nullable: true }) actorId: string | null;
  @Column() action: string; // task.created, task.moved, comment.added …
  @Column({ type: 'text' }) message: string;
  @Column({ type: 'jsonb', default: {} }) meta: Record<string, unknown>;
  @Index() @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') userId: string;
  @Column() type: string; // assigned, comment, deadline, mention, status
  @Column() title: string;
  @Column({ type: 'text', default: '' }) body: string;
  @Column({ default: '' }) link: string;
  @Column({ default: false }) read: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

export const ENTITIES = [Workspace, User, Project, Sprint, Task, Comment, Attachment, Activity, Notification];
