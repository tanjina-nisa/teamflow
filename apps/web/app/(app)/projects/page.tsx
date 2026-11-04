'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarClock, FolderKanban, Plus } from 'lucide-react';
import { useStore } from '@/lib/store';
import { canManageProjects } from '@/lib/logic';
import type { ProjectStatus } from '@/lib/types';
import { ProjectModal } from '@/components/modals';
import { AvatarStack, Empty, PageHeader, Progress, cx, daysLeft, fmtDate } from '@/components/ui';

const STATUS_STYLE: Record<ProjectStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  ON_HOLD: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  COMPLETED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export default function ProjectsPage() {
  const me = useStore((s) => s.me)!;
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const users = useStore((s) => s.users);
  const sprints = useStore((s) => s.sprints);
  const [filter, setFilter] = useState<'ALL' | ProjectStatus>('ALL');
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => projects.filter((p) => filter === 'ALL' || p.status === filter), [projects, filter]);

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} project${projects.length === 1 ? '' : 's'} in your workspace`}
        actions={canManageProjects(me.role) && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New project</button>}
      />
      <div className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1 text-sm sm:w-fit">
        {(['ALL', 'ACTIVE', 'ON_HOLD', 'COMPLETED'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cx('flex-1 rounded-lg px-3 py-1.5 font-medium sm:flex-none', filter === f ? 'bg-surface shadow-sm' : 'text-muted')}>
            {f === 'ALL' ? 'All' : f === 'ON_HOLD' ? 'On hold' : f[0] + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {!list.length ? (
        <div className="card">
          <Empty
            icon={<FolderKanban />}
            title={projects.length ? 'No projects match this filter' : 'No projects yet'}
            body={canManageProjects(me.role) ? 'Create a project, add your team and start planning sprints.' : 'Ask a project manager to add you to a project.'}
            action={canManageProjects(me.role) && !projects.length && <button className="btn-primary mt-2" onClick={() => setCreating(true)}><Plus size={16} /> New project</button>}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const pt = tasks.filter((t) => t.projectId === p.id);
            const done = pt.filter((t) => t.status === 'DONE').length;
            const pct = pt.length ? Math.round((done / pt.length) * 100) : 0;
            const active = sprints.find((s) => s.projectId === p.id && s.status === 'ACTIVE');
            const left = daysLeft(p.dueDate);
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand/40">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: p.color }}>{p.key.slice(0, 3)}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold group-hover:text-brand">{p.name}</h3>
                    <p className="text-xs text-muted">{p.key} · {active ? active.name : 'No active sprint'}</p>
                  </div>
                  <span className={cx('chip', STATUS_STYLE[p.status])}>{p.status === 'ON_HOLD' ? 'On hold' : p.status[0] + p.status.slice(1).toLowerCase()}</span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted">{p.description || 'No description'}</p>
                <div className="mt-auto pt-4">
                  <div className="mb-1.5 flex justify-between text-xs"><span className="text-muted">{done}/{pt.length} tasks done</span><span className="font-semibold">{pct}%</span></div>
                  <Progress value={pct} color={p.color} />
                  <div className="mt-4 flex items-center justify-between">
                    <AvatarStack users={users.filter((u) => p.memberIds.includes(u.id))} />
                    <span className={cx('inline-flex items-center gap-1 text-xs', left !== null && left < 0 && p.status !== 'COMPLETED' ? 'font-semibold text-rose-600' : 'text-muted')}>
                      <CalendarClock size={13} /> {fmtDate(p.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <ProjectModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
