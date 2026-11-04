'use client';

import { memo, useMemo, useState } from 'react';
import { ArrowRight, Calendar, Plus } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useTaskParam, useUI } from '@/lib/ui';
import { checkTaskRules, isOverdue } from '@/lib/logic';
import { ApiError, STATUSES, STATUS_LABEL, type Project, type Task, type TaskStatus, type User } from '@/lib/types';
import { Avatar, PriorityBadge, STATUS_COLOR, TypeIcon, cx, daysLeft, fmtDate } from './ui';

export const TaskCard = memo(function TaskCard({
  task, project, assignee, onOpen, onAdvance, draggable = true, compact,
}: {
  task: Task; project?: Project; assignee?: User | null; onOpen: (id: string) => void; onAdvance?: (t: Task) => void; draggable?: boolean; compact?: boolean;
}) {
  const overdue = isOverdue(task);
  const left = daysLeft(task.dueDate);
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task', task.id);
        e.dataTransfer.effectAllowed = 'move';
        (e.currentTarget as HTMLElement).style.opacity = '0.4';
      }}
      onDragEnd={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(task.id)}
      tabIndex={0}
      role="button"
      aria-label={`${project?.key}-${task.number} ${task.title}`}
      data-task={task.id}
      className="group card cursor-pointer p-3 transition hover:-translate-y-px hover:border-brand/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
        <TypeIcon t={task.type} size={12} />
        <span>{project ? `${project.key}-${task.number}` : `#${task.number}`}</span>
        <span className="ml-auto"><PriorityBadge p={task.priority} /></span>
      </div>
      <p className={cx('text-sm leading-snug font-medium', task.status === 'DONE' && 'text-muted line-through decoration-1')}>{task.title}</p>
      {!compact && task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <span key={l} className="chip bg-surface-2 font-medium text-muted">#{l}</span>
          ))}
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted">
        {task.dueDate && (
          <span className={cx('inline-flex items-center gap-1', overdue && 'font-semibold text-rose-600', !overdue && left !== null && left <= 1 && task.status !== 'DONE' && 'font-semibold text-amber-600')}>
            <Calendar size={11} />
            {overdue ? `${-left!}d overdue` : left === 0 ? 'Today' : left === 1 ? 'Tomorrow' : fmtDate(task.dueDate)}
          </span>
        )}
        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-semibold tabular-nums" title="Story points">{task.points} pt</span>
        <span className="ml-auto flex items-center gap-1.5">
          {onAdvance && task.status !== 'DONE' && (
            <button
              className="rounded-md p-1 opacity-0 transition group-hover:opacity-100 hover:bg-surface-2 focus:opacity-100 max-md:opacity-100"
              title={`Move to ${STATUS_LABEL[STATUSES[STATUSES.indexOf(task.status) + 1]]}`}
              aria-label="Move to next column"
              onClick={(e) => {
                e.stopPropagation();
                onAdvance(task);
              }}
            >
              <ArrowRight size={13} />
            </button>
          )}
          <Avatar user={assignee} size={22} />
        </span>
      </div>
    </div>
  );
});

/** Drag & drop board: To Do → In Progress → Review → Done. */
export function KanbanBoard({ tasks, projectFor, sprintId, projectId }: { tasks: Task[]; projectFor: (t: Task) => Project | undefined; sprintId?: string | null; projectId?: string }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me);
  const updateTask = useStore((s) => s.updateTask);
  const toast = useStore((s) => s.toast);
  const openNewTask = useUI((s) => s.openNewTask);
  const { open } = useTaskParam();
  const [over, setOver] = useState<{ status: TaskStatus; index: number } | null>(null);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const columns = useMemo(() => {
    const m: Record<TaskStatus, Task[]> = { TODO: [], IN_PROGRESS: [], REVIEW: [], DONE: [] };
    for (const t of tasks) m[t.status].push(t);
    for (const s of STATUSES) m[s].sort((a, b) => a.order - b.order);
    return m;
  }, [tasks]);

  const move = (task: Task, status: TaskStatus, rawIndex: number) => {
    const from = columns[status].findIndex((t) => t.id === task.id);
    const index = from !== -1 && from < rawIndex ? rawIndex - 1 : rawIndex;
    const col = columns[status].filter((t) => t.id !== task.id);
    let order: number;
    if (!col.length) order = 1000;
    else if (index <= 0) order = col[0].order - 1000;
    else if (index >= col.length) order = col[col.length - 1].order + 1000;
    else order = (col[index - 1].order + col[index].order) / 2;
    if (task.status === status && from === index) return;
    try {
      if (me) checkTaskRules(me, task, { status });
    } catch (e) {
      toast({ kind: 'error', title: (e as ApiError).message });
      return;
    }
    void updateTask(task.id, status === task.status ? { order } : { status, order }).then((t) => {
      if (t && status === 'DONE' && task.status !== 'DONE') toast({ kind: 'success', title: `${projectFor(task)?.key}-${task.number} done ✅` });
    });
  };

  const advance = (t: Task) => {
    const next = STATUSES[STATUSES.indexOf(t.status) + 1];
    if (next) move(t, next, columns[next].length);
  };

  const indexAt = (status: TaskStatus, el: HTMLElement, y: number) => {
    const cards = [...el.querySelectorAll<HTMLElement>('[data-task]')];
    const i = cards.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return i === -1 ? columns[status].length : i;
  };

  return (
    <div className="scroll-thin -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
      {STATUSES.map((status) => {
        const col = columns[status];
        const pts = col.reduce((a, t) => a + t.points, 0);
        const isOver = over?.status === status;
        return (
          <section
            key={status}
            aria-label={STATUS_LABEL[status]}
            className={cx('flex w-[82vw] max-w-[320px] shrink-0 snap-start flex-col rounded-2xl bg-surface-2/70 p-2.5 transition md:w-auto md:max-w-none', isOver && 'bg-brand-soft ring-2 ring-brand/30')}
            onDragOver={(e) => {
              e.preventDefault();
              const index = indexAt(status, e.currentTarget, e.clientY);
              if (over?.status !== status || over.index !== index) setOver({ status, index });
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/task');
              const t = tasks.find((x) => x.id === id);
              setOver(null);
              if (t) move(t, status, indexAt(status, e.currentTarget, e.clientY));
            }}
          >
            <header className="mb-2.5 flex items-center gap-2 px-1">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />
              <h3 className="text-sm font-semibold">{STATUS_LABEL[status]}</h3>
              <span className="rounded-full bg-surface px-2 text-xs font-semibold text-muted">{col.length}</span>
              <span className="ml-auto text-[11px] text-muted">{pts} pt</span>
              {projectId && (
                <button className="rounded-lg p-1 text-muted hover:bg-surface hover:text-ink" aria-label={`Add task to ${STATUS_LABEL[status]}`} onClick={() => openNewTask({ projectId, status, sprintId })}>
                  <Plus size={15} />
                </button>
              )}
            </header>
            <div className="flex min-h-24 flex-1 flex-col gap-2">
              {col.map((t, i) => (
                <div key={t.id}>
                  {isOver && over.index === i && <div className="mb-2 h-1 rounded-full bg-brand" />}
                  <TaskCard task={t} project={projectFor(t)} assignee={t.assigneeId ? userById.get(t.assigneeId) : null} onOpen={open} onAdvance={advance} />
                </div>
              ))}
              {isOver && over.index >= col.length && <div className="h-1 rounded-full bg-brand" />}
              {!col.length && !isOver && <p className="grid flex-1 place-items-center rounded-xl border border-dashed border-line py-6 text-xs text-muted">Drop tasks here</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

