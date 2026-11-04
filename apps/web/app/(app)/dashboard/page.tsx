'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, FolderKanban, ListTodo, Target } from 'lucide-react';
import { backend } from '@/lib/backend';
import { useStore } from '@/lib/store';
import { useTaskParam } from '@/lib/ui';
import { DAY, burndown, buildWorkload, isLead, isOverdue, todayISO } from '@/lib/logic';
import { STATUSES, STATUS_LABEL, type Activity } from '@/lib/types';
import { Burndown, ColumnLabels, Columns, Donut } from '@/components/charts';
import { Avatar, PageHeader, PriorityBadge, Progress, STATUS_COLOR, Select, StatusPill, cx, daysLeft, fmtDate, relTime } from '@/components/ui';

function Kpi({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: number | string; hint?: string; tone: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <span className={cx('grid h-10 w-10 place-items-center rounded-xl', tone)}>{icon}</span>
        <div>
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function Dashboard() {
  const me = useStore((s) => s.me)!;
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const sprints = useStore((s) => s.sprints);
  const users = useStore((s) => s.users);
  const tick = useStore((s) => s.tick);
  const { open } = useTaskParam();
  const [acts, setActs] = useState<Activity[]>([]);

  useEffect(() => {
    backend().listActivity({ limit: 8 }).then(setActs).catch(() => undefined);
  }, [tick, tasks.length]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const activeSprints = sprints.filter((s) => s.status === 'ACTIVE');
  const [sprintId, setSprintId] = useState('');
  const sprint = activeSprints.find((s) => s.id === sprintId) ?? activeSprints[0];

  const stats = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'DONE');
    const weekEnd = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
    const done7 = tasks.filter((t) => t.completedAt && Date.now() - new Date(t.completedAt).getTime() < 7 * DAY);
    const perDay = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * DAY).toISOString().slice(0, 10);
      return { label: d.slice(8), value: tasks.filter((t) => t.completedAt?.slice(0, 10) === d).length };
    });
    return {
      open: open.length,
      dueWeek: open.filter((t) => t.dueDate && t.dueDate >= todayISO() && t.dueDate <= weekEnd).length,
      overdue: open.filter(isOverdue).length,
      done7: done7.length,
      points7: done7.reduce((a, t) => a + t.points, 0),
      perDay,
    };
  }, [tasks]);

  const mine = tasks
    .filter((t) => t.assigneeId === me.id && t.status !== 'DONE')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .slice(0, 6);
  const upcoming = tasks
    .filter((t) => t.status !== 'DONE' && t.dueDate && (daysLeft(t.dueDate) ?? 99) <= 7)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .slice(0, 6);
  const workload = buildWorkload(tasks, users).filter((w) => w.openTasks > 0).sort((a, b) => b.utilization - a.utilization).slice(0, 5);
  const bd = sprint ? burndown(tasks.filter((t) => t.sprintId === sprint.id), sprint.startDate, sprint.endDate) : null;
  const hour = new Date().getHours();

  return (
    <>
      <PageHeader
        title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${me.name.split(' ')[0]} 👋`}
        subtitle={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + ` · ${stats.open} open tasks across ${projects.length} projects`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={<FolderKanban size={19} />} label="Active projects" value={projects.filter((p) => p.status === 'ACTIVE').length} hint={`${activeSprints.length} sprint(s) running`} tone="bg-brand-soft text-brand" />
        <Kpi icon={<ListTodo size={19} />} label="Open tasks" value={stats.open} hint={`${tasks.filter((t) => t.status === 'REVIEW').length} waiting for review`} tone="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" />
        <Kpi icon={<CalendarClock size={19} />} label="Due in 7 days" value={stats.dueWeek} hint={stats.overdue ? `${stats.overdue} already overdue` : 'Nothing overdue 🎉'} tone="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
        <Kpi icon={<CheckCircle2 size={19} />} label="Done this week" value={stats.done7} hint={`${stats.points7} story points delivered`} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div>
              <h2 className="font-semibold">Sprint burndown</h2>
              <p className="text-xs text-muted">{sprint ? `${projectById.get(sprint.projectId)?.name} · ${sprint.name} · ${fmtDate(sprint.startDate)} – ${fmtDate(sprint.endDate)}` : 'No active sprint'}</p>
            </div>
            {activeSprints.length > 1 && (
              <Select className="ml-auto w-56" ariaLabel="Sprint" value={sprint?.id ?? ''} onChange={setSprintId}>
                {activeSprints.map((s) => <option key={s.id} value={s.id}>{projectById.get(s.projectId)?.key} · {s.name}</option>)}
              </Select>
            )}
          </div>
          {bd ? (
            <>
              <Burndown points={bd.points} total={bd.total} />
              <div className="mt-2 flex gap-4 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-brand" /> Remaining points</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-muted" /> Ideal</span>
                <span className="ml-auto font-medium text-ink">{bd.points.filter((p) => p.actual !== null).at(-1)?.actual ?? bd.total} of {bd.total} pts left</span>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted">Start a sprint from a project’s Sprints tab to see its burndown.</p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Tasks by status</h2>
          <Donut
            label={`${tasks.length ? Math.round((tasks.filter((t) => t.status === 'DONE').length / tasks.length) * 100) : 0}%`}
            sub="complete"
            data={STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: tasks.filter((t) => t.status === s).length, color: STATUS_COLOR[s] }))}
          />
          <div className="mt-5">
            <p className="mb-1 text-xs font-medium text-muted">Completed per day (last 14 days)</p>
            <Columns data={stats.perDay} height={70} />
            <ColumnLabels labels={stats.perDay.map((d, i) => (i % 2 ? '' : d.label))} />
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">My open tasks</h2>
            <Link href="/my-tasks" className="inline-flex items-center gap-1 text-xs font-medium text-brand">View all <ArrowRight size={12} /></Link>
          </div>
          <ul className="divide-y divide-line">
            {mine.map((t) => (
              <li key={t.id}>
                <button className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => open(t.id)}>
                  <span className="w-16 shrink-0 font-mono text-xs text-muted">{projectById.get(t.projectId)?.key}-{t.number}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                  <StatusPill s={t.status} />
                  <span className={cx('w-16 text-right text-xs', isOverdue(t) ? 'font-semibold text-rose-600' : 'text-muted')}>{fmtDate(t.dueDate)}</span>
                </button>
              </li>
            ))}
            {!mine.length && <li className="py-8 text-center text-sm text-muted">No open tasks assigned to you.</li>}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><AlertTriangle size={16} className="text-amber-500" /> Upcoming deadlines</h2>
          <ul className="divide-y divide-line">
            {upcoming.map((t) => {
              const d = daysLeft(t.dueDate)!;
              return (
                <li key={t.id}>
                  <button className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => open(t.id)}>
                    <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-center text-[10px] leading-tight font-bold', d < 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : d <= 1 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-surface-2 text-muted')}>
                      {d < 0 ? <>{-d}d<br />late</> : d === 0 ? 'Today' : <>{d}d<br />left</>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="text-xs text-muted">{projectById.get(t.projectId)?.name}</span>
                    </span>
                    <PriorityBadge p={t.priority} />
                    <Avatar user={t.assigneeId ? userById.get(t.assigneeId) : null} size={24} />
                  </button>
                </li>
              );
            })}
            {!upcoming.length && <li className="py-8 text-center text-sm text-muted">No deadlines in the next 7 days.</li>}
          </ul>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold"><Target size={16} className="text-brand" /> Project progress</h2>
          <ul className="space-y-4">
            {projects.map((p) => {
              const pt = tasks.filter((t) => t.projectId === p.id);
              const pct = pt.length ? Math.round((pt.filter((t) => t.status === 'DONE').length / pt.length) * 100) : 0;
              const left = daysLeft(p.dueDate);
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="block">
                    <div className="mb-1.5 flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded" style={{ background: p.color }} />
                      <span className="flex-1 truncate font-medium">{p.name}</span>
                      <span className="text-xs font-semibold tabular-nums">{pct}%</span>
                    </div>
                    <Progress value={pct} color={p.color} />
                    <p className="mt-1 text-[11px] text-muted">{left === null ? 'No deadline' : left < 0 ? `${-left} days past deadline` : `${left} days to deadline`}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Team workload</h2>
            {isLead(me.role) && <Link href="/team" className="inline-flex items-center gap-1 text-xs font-medium text-brand">Details <ArrowRight size={12} /></Link>}
          </div>
          <ul className="space-y-3.5">
            {workload.map((w) => (
              <li key={w.user.id} className="flex items-center gap-3">
                <Avatar user={w.user} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm"><span className="truncate font-medium">{w.user.name}</span><span className={cx('text-xs font-semibold tabular-nums', w.utilization > 100 ? 'text-rose-600' : 'text-muted')}>{w.openPoints}/{w.user.capacity} pt</span></div>
                  <Progress className="mt-1.5" value={w.utilization} color={w.utilization > 100 ? '#e11d48' : w.utilization > 80 ? '#f59e0b' : '#10b981'} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Recent activity</h2>
            <Link href="/activity" className="inline-flex items-center gap-1 text-xs font-medium text-brand">All <ArrowRight size={12} /></Link>
          </div>
          <ul className="space-y-3">
            {acts.map((a) => (
              <li key={a.id} className="flex gap-2.5 text-sm">
                <Avatar user={a.actorId ? userById.get(a.actorId) : null} size={26} />
                <p className="min-w-0 flex-1 leading-snug">
                  <span className="font-semibold">{userById.get(a.actorId ?? '')?.name.split(' ')[0] ?? 'System'}</span> <span className="text-muted">{a.message}</span>
                  <span className="block text-[11px] text-muted">{relTime(a.createdAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
