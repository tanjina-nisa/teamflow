'use client';

import { useMemo, useState } from 'react';
import { KanbanSquare, List } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useTaskParam } from '@/lib/ui';
import { DAY, isOverdue, todayISO } from '@/lib/logic';
import type { Task } from '@/lib/types';
import { KanbanBoard } from '@/components/kanban';
import { PageHeader, PriorityBadge, StatusPill, TypeIcon, cx, fmtDate } from '@/components/ui';

export default function MyTasks() {
  const me = useStore((s) => s.me)!;
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const { open } = useTaskParam();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [showDone, setShowDone] = useState(false);
  const pk = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const mine = tasks.filter((t) => t.assigneeId === me.id);

  const groups = useMemo(() => {
    const today = todayISO();
    const week = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
    const open = mine.filter((t) => t.status !== 'DONE');
    const by = (f: (t: Task) => boolean) => open.filter(f).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
    const g: [string, Task[], string][] = [
      ['Overdue', by(isOverdue), 'text-rose-600'],
      ['Today', by((t) => t.dueDate === today), 'text-amber-600'],
      ['Next 7 days', by((t) => !!t.dueDate && t.dueDate > today && t.dueDate <= week), ''],
      ['Later', by((t) => !!t.dueDate && t.dueDate > week), ''],
      ['No due date', by((t) => !t.dueDate), 'text-muted'],
    ];
    if (showDone) g.push(['Done', mine.filter((t) => t.status === 'DONE').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')), 'text-emerald-600']);
    return g;
  }, [mine, showDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCount = mine.filter((t) => t.status !== 'DONE').length;
  return (
    <>
      <PageHeader
        title="My tasks"
        subtitle={`${openCount} open · ${mine.filter((t) => t.status !== 'DONE').reduce((a, t) => a + t.points, 0)} story points assigned to you`}
        actions={
          <div className="flex gap-1 rounded-xl bg-surface-2 p-1 text-sm">
            <button className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium', view === 'list' ? 'bg-surface shadow-sm' : 'text-muted')} onClick={() => setView('list')}><List size={15} /> List</button>
            <button className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium', view === 'board' ? 'bg-surface shadow-sm' : 'text-muted')} onClick={() => setView('board')}><KanbanSquare size={15} /> Board</button>
          </div>
        }
      />
      {view === 'board' ? (
        <KanbanBoard tasks={mine} projectFor={(t) => pk.get(t.projectId)} />
      ) : (
        <div className="space-y-4">
          {groups.map(([label, list, tone]) =>
            list.length ? (
              <section key={label} className="card overflow-hidden">
                <h2 className={cx('border-b border-line px-4 py-2.5 text-sm font-semibold', tone)}>{label} <span className="font-normal text-muted">· {list.length}</span></h2>
                <ul className="divide-y divide-line">
                  {list.map((t) => {
                    const p = pk.get(t.projectId);
                    return (
                      <li key={t.id}>
                        <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2" onClick={() => open(t.id)}>
                          <TypeIcon t={t.type} size={13} />
                          <span className="w-16 shrink-0 font-mono text-xs text-muted">{p?.key}-{t.number}</span>
                          <span className="min-w-0 flex-1">
                            <span className={cx('block truncate text-sm font-medium', t.status === 'DONE' && 'text-muted line-through')}>{t.title}</span>
                            <span className="flex items-center gap-1.5 text-[11px] text-muted"><span className="h-2 w-2 rounded-sm" style={{ background: p?.color }} />{p?.name}</span>
                          </span>
                          <span className="hidden sm:block"><StatusPill s={t.status} /></span>
                          <PriorityBadge p={t.priority} />
                          <span className={cx('w-16 text-right text-xs', isOverdue(t) ? 'font-semibold text-rose-600' : 'text-muted')}>{fmtDate(t.dueDate)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null,
          )}
          {!openCount && !showDone && <div className="card p-10 text-center text-sm text-muted">Nothing on your plate. Nice work! 🎉</div>}
          <button className="text-sm font-medium text-brand" onClick={() => setShowDone((v) => !v)}>{showDone ? 'Hide' : 'Show'} completed tasks</button>
        </div>
      )}
    </>
  );
}
