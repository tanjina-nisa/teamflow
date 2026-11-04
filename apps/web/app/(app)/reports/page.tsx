'use client';

import { useMemo, useState } from 'react';
import { ClipboardCopy, Download, Printer } from 'lucide-react';
import { backend } from '@/lib/backend';
import { useStore } from '@/lib/store';
import { useTaskParam } from '@/lib/ui';
import { DAY, buildProgress, downloadBlob, type Range } from '@/lib/logic';
import { STATUS_LABEL } from '@/lib/types';
import { ColumnLabels, Columns } from '@/components/charts';
import { Avatar, PageHeader, Progress, Select, cx, fmtDate } from '@/components/ui';

export default function Reports() {
  const tasksAll = useStore((s) => s.tasks);
  const projectsAll = useStore((s) => s.projects);
  const users = useStore((s) => s.users);
  const workspace = useStore((s) => s.workspace);
  const toast = useStore((s) => s.toast);
  const { open } = useTaskParam();
  const [range, setRange] = useState<Range>('weekly');
  const [projectId, setProjectId] = useState('');

  const projects = projectId ? projectsAll.filter((p) => p.id === projectId) : projectsAll;
  const tasks = projectId ? tasksAll.filter((t) => t.projectId === projectId) : tasksAll;
  const r = useMemo(() => buildProgress(tasks, users, projects, range), [tasks, users, projects, range]);
  const pk = new Map(projectsAll.map((p) => [p.id, p]));
  const un = new Map(users.map((u) => [u.id, u]));

  const days = range === 'daily' ? 1 : 7;
  const series = useMemo(() => {
    const n = range === 'daily' ? 24 : 7;
    return Array.from({ length: n }, (_, i) => {
      if (range === 'daily') {
        const start = Date.now() - (n - i) * 3600000;
        return { label: `${new Date(start).getHours()}h`, value: tasks.filter((t) => t.completedAt && new Date(t.completedAt).getTime() >= start && new Date(t.completedAt).getTime() < start + 3600000).length };
      }
      const d = new Date(Date.now() - (n - 1 - i) * DAY).toISOString().slice(0, 10);
      return { label: new Date(d).toLocaleDateString('en-GB', { weekday: 'short' }), value: tasks.filter((t) => t.completedAt?.slice(0, 10) === d).length };
    });
  }, [tasks, range]);

  const summaryText = () => {
    const name = projectId ? pk.get(projectId)?.name : workspace?.name;
    const lines = [
      `${range === 'daily' ? 'Daily' : 'Weekly'} progress report — ${name}`,
      `${fmtDate(r.from.toISOString(), { day: 'numeric', month: 'short' })} to ${fmtDate(r.to.toISOString(), { day: 'numeric', month: 'short', year: 'numeric' })}`,
      '',
      `✅ Completed: ${r.totals.completed} tasks (${r.totals.pointsCompleted} pts)`,
      `🆕 Created: ${r.totals.created} · 🔧 In progress: ${r.totals.inProgress} · 👀 In review: ${r.totals.inReview}`,
      `⚠️ Overdue: ${r.totals.overdue}`,
      '',
      'Done:',
      ...r.completed.map((t) => `  • ${pk.get(t.projectId)?.key}-${t.number} ${t.title} (${un.get(t.assigneeId ?? '')?.name ?? 'unassigned'})`),
      ...(r.overdue.length ? ['', 'Blockers / overdue:', ...r.overdue.map((t) => `  • ${pk.get(t.projectId)?.key}-${t.number} ${t.title} — due ${t.dueDate} (${un.get(t.assigneeId ?? '')?.name ?? 'unassigned'})`)] : []),
    ];
    return lines.join('\n');
  };

  const exportSummary = () => {
    const rows = [
      ['Member', 'Role', 'Completed', 'Points completed', 'Open', 'Overdue'],
      ...r.byMember.map((m) => [m.user.name, m.user.role, m.completed, m.pointsCompleted, m.open, m.overdue]),
      [],
      ['Project', 'Key', 'Total tasks', 'Done', 'Progress %', `Completed in last ${days}d`],
      ...r.byProject.map((p) => [p.project.name, p.project.key, p.total, p.done, p.progress, p.completedInPeriod]),
    ];
    downloadBlob(new Blob(['﻿' + rows.map((x) => x.join(',')).join('\n')], { type: 'text/csv' }), `teamflow-${range}-report-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <>
      <PageHeader
        title="Progress reports"
        subtitle={`${fmtDate(r.from.toISOString(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} → now`}
        actions={
          <>
            <div className="flex gap-1 rounded-xl bg-surface-2 p-1 text-sm">
              {(['daily', 'weekly'] as Range[]).map((x) => (
                <button key={x} onClick={() => setRange(x)} className={cx('rounded-lg px-3 py-1.5 font-medium capitalize', range === x ? 'bg-surface shadow-sm' : 'text-muted')}>{x}</button>
              ))}
            </div>
            <Select className="w-52" ariaLabel="Project" value={projectId} onChange={setProjectId}>
              <option value="">All projects</option>
              {projectsAll.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <button className="btn-ghost" onClick={async () => { await navigator.clipboard.writeText(summaryText()); toast({ kind: 'success', title: 'Report copied', body: 'Paste it into Slack or email' }); }}><ClipboardCopy size={15} /> Copy</button>
            <button className="btn-ghost" onClick={exportSummary}><Download size={15} /> Summary CSV</button>
            <button className="btn-ghost" onClick={async () => downloadBlob(await backend().exportCsv(projectId || undefined), `teamflow-tasks-${new Date().toISOString().slice(0, 10)}.csv`)}><Download size={15} /> Tasks CSV</button>
            <button className="btn-primary" onClick={() => window.print()}><Printer size={15} /> PDF</button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {([
          ['Completed', r.totals.completed, 'text-emerald-600'],
          ['Points delivered', r.totals.pointsCompleted, 'text-brand'],
          ['Created', r.totals.created, ''],
          ['In progress', r.totals.inProgress, ''],
          ['In review', r.totals.inReview, 'text-amber-600'],
          ['Overdue', r.totals.overdue, 'text-rose-600'],
        ] as const).map(([l, v, tone]) => (
          <div key={l} className="card p-4">
            <p className="text-xs font-medium text-muted">{l}</p>
            <p className={cx('mt-1 text-3xl font-bold tabular-nums', tone)}>{v}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <h2 className="mb-3 font-semibold">Tasks completed {range === 'daily' ? 'per hour (last 24h)' : 'per day (last 7 days)'}</h2>
          <Columns data={series} height={170} />
          <ColumnLabels labels={series.map((s, i) => (range === 'daily' && i % 3 ? '' : s.label))} />
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Project progress</h2>
          <ul className="space-y-3.5">
            {r.byProject.map((p) => (
              <li key={p.project.id}>
                <div className="mb-1 flex justify-between text-sm"><span className="truncate font-medium">{p.project.name}</span><span className="text-xs text-muted">+{p.completedInPeriod} · {p.progress}%</span></div>
                <Progress value={p.progress} color={p.project.color} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card mt-4 overflow-x-auto">
        <h2 className="border-b border-line px-5 py-3 font-semibold">Team performance</h2>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr><th className="px-5 py-2.5 font-medium">Member</th><th className="px-3 font-medium">Completed</th><th className="px-3 font-medium">Points</th><th className="px-3 font-medium">Open</th><th className="px-3 font-medium">Overdue</th><th className="w-1/4 px-5 font-medium">Share of delivered points</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...r.byMember].sort((a, b) => b.pointsCompleted - a.pointsCompleted).map((m) => (
              <tr key={m.user.id}>
                <td className="px-5 py-2.5"><span className="flex items-center gap-2.5"><Avatar user={m.user} size={26} /><span><span className="block font-medium">{m.user.name}</span><span className="text-[11px] text-muted">{m.user.title}</span></span></span></td>
                <td className="px-3 font-semibold tabular-nums">{m.completed}</td>
                <td className="px-3 tabular-nums">{m.pointsCompleted}</td>
                <td className="px-3 tabular-nums">{m.open}</td>
                <td className={cx('px-3 tabular-nums', m.overdue > 0 && 'font-semibold text-rose-600')}>{m.overdue}</td>
                <td className="px-5"><Progress value={r.totals.pointsCompleted ? (m.pointsCompleted / r.totals.pointsCompleted) * 100 : 0} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-line px-5 py-3 font-semibold text-emerald-600">Completed ({r.completed.length})</h2>
          <ul className="divide-y divide-line">
            {r.completed.map((t) => (
              <li key={t.id}><button className="flex w-full gap-3 px-5 py-2.5 text-left text-sm hover:bg-surface-2" onClick={() => open(t.id)}><span className="w-16 shrink-0 font-mono text-xs text-muted">{pk.get(t.projectId)?.key}-{t.number}</span><span className="flex-1 truncate">{t.title}</span><span className="text-xs text-muted">{un.get(t.assigneeId ?? '')?.name.split(' ')[0]}</span></button></li>
            ))}
            {!r.completed.length && <li className="px-5 py-6 text-center text-sm text-muted">Nothing completed in this period yet.</li>}
          </ul>
        </section>
        <section className="card">
          <h2 className="border-b border-line px-5 py-3 font-semibold text-rose-600">Overdue / blockers ({r.overdue.length})</h2>
          <ul className="divide-y divide-line">
            {r.overdue.map((t) => (
              <li key={t.id}><button className="flex w-full gap-3 px-5 py-2.5 text-left text-sm hover:bg-surface-2" onClick={() => open(t.id)}><span className="w-16 shrink-0 font-mono text-xs text-muted">{pk.get(t.projectId)?.key}-{t.number}</span><span className="flex-1 truncate">{t.title}</span><span className="text-xs text-muted">{STATUS_LABEL[t.status]} · due {fmtDate(t.dueDate)}</span></button></li>
            ))}
            {!r.overdue.length && <li className="px-5 py-6 text-center text-sm text-muted">No overdue work 🎉</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
