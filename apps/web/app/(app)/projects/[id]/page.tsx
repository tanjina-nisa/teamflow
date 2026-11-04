'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, CalendarRange, CheckCircle2, Download, Filter, Inbox, KanbanSquare, List, Pencil, Play, Plus, Trash2, Users, Activity as ActivityIcon, Rocket } from 'lucide-react';
import { backend } from '@/lib/backend';
import { useStore } from '@/lib/store';
import { useTaskParam, useUI } from '@/lib/ui';
import { burndown, canManageProjects, downloadBlob, isLead, isOverdue } from '@/lib/logic';
import type { Activity, Sprint, Task } from '@/lib/types';
import { KanbanBoard } from '@/components/kanban';
import { ProjectModal, SprintModal } from '@/components/modals';
import { Burndown } from '@/components/charts';
import { Avatar, AvatarStack, Empty, PriorityBadge, Progress, RoleBadge, Select, StatusPill, TypeIcon, cx, fmtDate, relTime } from '@/components/ui';

type Tab = 'board' | 'sprints' | 'list' | 'members' | 'activity';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const me = useStore((s) => s.me)!;
  const project = useStore((s) => s.projects.find((p) => p.id === id));
  const allTasks = useStore((s) => s.tasks);
  const allSprints = useStore((s) => s.sprints);
  const users = useStore((s) => s.users);
  const deleteProject = useStore((s) => s.deleteProject);
  const toast = useStore((s) => s.toast);
  const openNewTask = useUI((s) => s.openNewTask);
  const [tab, setTab] = useState<Tab>('board');
  const [editing, setEditing] = useState(false);

  const tasks = useMemo(() => allTasks.filter((t) => t.projectId === id), [allTasks, id]);
  const sprints = useMemo(() => allSprints.filter((s) => s.projectId === id).sort((a, b) => a.startDate.localeCompare(b.startDate)), [allSprints, id]);
  const active = sprints.find((s) => s.status === 'ACTIVE');
  const members = users.filter((u) => project?.memberIds.includes(u.id));

  const [scope, setScope] = useState<string>('active');
  const [who, setWho] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [q, setQ] = useState('');
  useEffect(() => setScope(active ? 'active' : 'all'), [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) {
    return <div className="card"><Empty icon={<Inbox />} title="Project not found" body="It may have been deleted, or you are not a member." action={<Link className="btn-ghost mt-2" href="/projects">Back to projects</Link>} /></div>;
  }

  const boardTasks = tasks.filter((t) => {
    if (scope === 'active' && t.sprintId !== (active?.id ?? '__none')) return false;
    if (scope === 'backlog' && t.sprintId) return false;
    if (scope !== 'active' && scope !== 'backlog' && scope !== 'all' && t.sprintId !== scope) return false;
    if (who === 'me' && t.assigneeId !== me.id) return false;
    if (who && who !== 'me' && (who === 'none' ? t.assigneeId : t.assigneeId !== who)) return false;
    if (type && t.type !== type) return false;
    if (q && !t.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const done = tasks.filter((t) => t.status === 'DONE').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const lead = isLead(me.role);

  const TABS: [Tab, string, typeof List][] = [
    ['board', 'Board', KanbanSquare],
    ['sprints', 'Sprints & backlog', CalendarRange],
    ['list', 'List', List],
    ['members', `Members (${members.length})`, Users],
    ['activity', 'Activity', ActivityIcon],
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-lg font-bold text-white" style={{ background: project.color }}>{project.key.slice(0, 3)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <span className="chip bg-surface-2 font-mono text-muted">{project.key}</span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted">{project.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
            <span className="flex items-center gap-2"><Progress value={pct} color={project.color} className="w-28" /> <b className="text-ink">{pct}%</b> done</span>
            <span>{fmtDate(project.startDate)} → {fmtDate(project.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <AvatarStack users={members} size={22} max={6} />
          </div>
        </div>
        <div className="no-print flex w-full flex-wrap gap-2 sm:w-auto">
          <button className="btn-ghost" onClick={async () => downloadBlob(await backend().exportCsv(project.id), `${project.key}-tasks.csv`)}><Download size={15} /> CSV</button>
          {canManageProjects(me.role) && <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</button>}
          {me.role === 'ADMIN' && (
            <button
              className="btn-ghost text-rose-600"
              aria-label="Delete project"
              onClick={async () => {
                if (!confirm(`Delete ${project.name} and all of its tasks? This cannot be undone.`)) return;
                await deleteProject(project.id);
                toast({ kind: 'success', title: 'Project deleted' });
                history.back();
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
          <button className="btn-primary" onClick={() => openNewTask({ projectId: project.id, sprintId: scope === 'backlog' ? null : undefined })}><Plus size={16} /> Task</button>
        </div>
      </div>

      <div className="no-print scroll-thin mb-5 flex gap-1 overflow-x-auto border-b border-line text-sm">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 font-medium', tab === k ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {(tab === 'board' || tab === 'list') && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select className="w-48" ariaLabel="Sprint filter" value={scope} onChange={setScope}>
            {active && <option value="active">Active sprint · {active.name}</option>}
            <option value="all">All tasks</option>
            <option value="backlog">Backlog only</option>
            {sprints.filter((s) => s.status !== 'ACTIVE').map((s) => <option key={s.id} value={s.id}>{s.name} ({s.status.toLowerCase()})</option>)}
          </Select>
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
            <button className={cx('rounded-lg px-2.5 py-1 text-xs font-semibold', !who ? 'bg-brand-soft text-brand' : 'text-muted')} onClick={() => setWho('')}>All</button>
            <button className={cx('rounded-lg px-2.5 py-1 text-xs font-semibold', who === 'me' ? 'bg-brand-soft text-brand' : 'text-muted')} onClick={() => setWho('me')}>Mine</button>
            {members.map((u) => (
              <button key={u.id} className={cx('rounded-full', who === u.id && 'ring-2 ring-brand ring-offset-1 ring-offset-surface')} onClick={() => setWho(who === u.id ? '' : u.id)} aria-label={`Filter by ${u.name}`}>
                <Avatar user={u} size={24} />
              </button>
            ))}
          </div>
          <Select className="w-36" ariaLabel="Type filter" value={type} onChange={setType}>
            <option value="">All types</option>
            <option value="FEATURE">Features</option>
            <option value="BUG">Bugs</option>
            <option value="CHORE">Chores</option>
          </Select>
          <div className="relative">
            <Filter size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input className="input w-48 pl-8" placeholder="Filter by title" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!lead && <span className="ml-auto text-xs text-muted">QA gate: only testers & PMs can move cards to Done</span>}
        </div>
      )}

      {tab === 'board' && <KanbanBoard tasks={boardTasks} projectFor={() => project} projectId={project.id} sprintId={scope === 'active' ? active?.id ?? null : scope === 'backlog' ? null : scope === 'all' ? undefined : scope} />}
      {tab === 'list' && <TaskTable tasks={boardTasks} />}
      {tab === 'sprints' && <SprintsTab projectId={project.id} sprints={sprints} tasks={tasks} />}
      {tab === 'members' && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((u) => {
            const open = tasks.filter((t) => t.assigneeId === u.id && t.status !== 'DONE');
            return (
              <div key={u.id} className="card flex items-center gap-3 p-4">
                <Avatar user={u} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{u.name} {u.id === project.ownerId && <span className="text-xs font-normal text-muted">· owner</span>}</p>
                  <p className="truncate text-xs text-muted">{u.title}</p>
                  <div className="mt-1.5 flex items-center gap-2"><RoleBadge role={u.role} /><span className="text-xs text-muted">{open.length} open · {open.reduce((a, t) => a + t.points, 0)} pt</span></div>
                </div>
              </div>
            );
          })}
          {canManageProjects(me.role) && (
            <button className="card grid place-items-center border-dashed p-4 text-sm font-medium text-muted hover:text-brand" onClick={() => setEditing(true)}>
              <span className="flex items-center gap-2"><Plus size={16} /> Add or remove members</span>
            </button>
          )}
        </div>
      )}
      {tab === 'activity' && <ProjectActivity projectId={project.id} />}

      <ProjectModal open={editing} onClose={() => setEditing(false)} project={project} />
    </>
  );
}

function TaskTable({ tasks }: { tasks: Task[] }) {
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const { open } = useTaskParam();
  const [sort, setSort] = useState<{ k: 'number' | 'title' | 'status' | 'priority' | 'dueDate' | 'points'; dir: 1 | -1 }>({ k: 'number', dir: 1 });
  const rank = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3, TODO: 0, IN_PROGRESS: 1, REVIEW: 2, DONE: 3 } as Record<string, number>;
  const rows = [...tasks].sort((a, b) => {
    const k = sort.k;
    const va = k === 'priority' || k === 'status' ? rank[a[k]] : a[k] ?? '';
    const vb = k === 'priority' || k === 'status' ? rank[b[k]] : b[k] ?? '';
    return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
  });
  const H = ({ k, label, className }: { k: typeof sort.k; label: string; className?: string }) => (
    <th className={cx('px-3 py-2.5 font-medium', className)}>
      <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort({ k, dir: sort.k === k ? (-sort.dir as 1 | -1) : 1 })}>{label} <ArrowUpDown size={11} /></button>
    </th>
  );
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr><H k="number" label="Key" /><H k="title" label="Title" /><H k="status" label="Status" /><H k="priority" label="Priority" /><th className="px-3 py-2.5 font-medium">Assignee</th><H k="points" label="Pts" /><H k="dueDate" label="Due" /></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((t) => {
            const a = users.find((u) => u.id === t.assigneeId);
            return (
              <tr key={t.id} className="cursor-pointer hover:bg-surface-2" onClick={() => open(t.id)}>
                <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-muted"><span className="inline-flex items-center gap-1.5"><TypeIcon t={t.type} size={12} />{projects.find((p) => p.id === t.projectId)?.key}-{t.number}</span></td>
                <td className="max-w-md truncate px-3 py-2.5 font-medium">{t.title}</td>
                <td className="px-3 py-2.5"><StatusPill s={t.status} /></td>
                <td className="px-3 py-2.5"><PriorityBadge p={t.priority} /></td>
                <td className="px-3 py-2.5"><span className="flex items-center gap-2"><Avatar user={a} size={22} /><span className="truncate text-xs">{a?.name ?? 'Unassigned'}</span></span></td>
                <td className="px-3 py-2.5 tabular-nums">{t.points}</td>
                <td className={cx('px-3 py-2.5 text-xs whitespace-nowrap', isOverdue(t) ? 'font-semibold text-rose-600' : 'text-muted')}>{fmtDate(t.dueDate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <p className="py-10 text-center text-sm text-muted">No tasks match these filters.</p>}
    </div>
  );
}

function SprintsTab({ projectId, sprints, tasks }: { projectId: string; sprints: Sprint[]; tasks: Task[] }) {
  const me = useStore((s) => s.me)!;
  const users = useStore((s) => s.users);
  const startSprint = useStore((s) => s.startSprint);
  const completeSprint = useStore((s) => s.completeSprint);
  const deleteSprint = useStore((s) => s.deleteSprint);
  const updateTask = useStore((s) => s.updateTask);
  const openNewTask = useUI((s) => s.openNewTask);
  const { open } = useTaskParam();
  const [planning, setPlanning] = useState(false);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const lead = isLead(me.role);
  const backlog = tasks.filter((t) => !t.sprintId || !sprints.some((s) => s.id === t.sprintId && s.status !== 'COMPLETED')).filter((t) => t.status !== 'DONE' || !t.sprintId);
  const visible = sprints.filter((s) => s.status !== 'COMPLETED');
  const completed = sprints.filter((s) => s.status === 'COMPLETED');

  const dropProps = (target: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDropOn(target ?? 'backlog');
    },
    onDragLeave: () => setDropOn(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropOn(null);
      const id = e.dataTransfer.getData('text/task');
      const t = tasks.find((x) => x.id === id);
      if (t && t.sprintId !== target) void updateTask(id, { sprintId: target });
    },
  });

  const Row = ({ t }: { t: Task }) => {
    const a = users.find((u) => u.id === t.assigneeId);
    return (
      <li draggable onDragStart={(e) => e.dataTransfer.setData('text/task', t.id)} onClick={() => open(t.id)} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
        <TypeIcon t={t.type} size={13} />
        <span className="w-14 shrink-0 font-mono text-xs text-muted">#{t.number}</span>
        <span className={cx('min-w-0 flex-1 truncate text-sm', t.status === 'DONE' && 'text-muted line-through')}>{t.title}</span>
        <span className="hidden sm:block"><StatusPill s={t.status} /></span>
        <PriorityBadge p={t.priority} />
        <span className="w-10 text-right text-xs font-semibold tabular-nums">{t.points} pt</span>
        <Avatar user={a} size={22} />
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {lead && <div className="flex justify-end"><button className="btn-primary" onClick={() => setPlanning(true)}><Plus size={16} /> Plan sprint</button></div>}
      {visible.map((s) => {
        const st = tasks.filter((t) => t.sprintId === s.id);
        const pts = st.reduce((a, t) => a + t.points, 0);
        const donePts = st.filter((t) => t.status === 'DONE').reduce((a, t) => a + t.points, 0);
        const bd = s.status === 'ACTIVE' ? burndown(st, s.startDate, s.endDate) : null;
        return (
          <section key={s.id} className={cx('card overflow-hidden transition', dropOn === s.id && 'ring-2 ring-brand')} {...dropProps(s.id)}>
            <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 font-semibold">{s.name} {s.status === 'ACTIVE' ? <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Active</span> : <span className="chip bg-surface-2 text-muted">Planned</span>}</h3>
                <p className="text-xs text-muted">{fmtDate(s.startDate)} – {fmtDate(s.endDate)} · {st.length} tasks · {donePts}/{pts} pt done{s.goal && ` · 🎯 ${s.goal}`}</p>
              </div>
              <div className="ml-auto flex gap-2">
                <button className="btn-ghost py-1.5 text-xs" onClick={() => openNewTask({ projectId, sprintId: s.id })}><Plus size={14} /> Task</button>
                {lead && s.status === 'PLANNED' && <button className="btn-ghost py-1.5 text-xs" onClick={() => startSprint(s.id)}><Play size={14} /> Start</button>}
                {lead && s.status === 'ACTIVE' && (
                  <button className="btn-primary py-1.5 text-xs" onClick={() => confirm(`Complete ${s.name}? Unfinished tasks go back to the backlog.`) && completeSprint(s.id)}><CheckCircle2 size={14} /> Complete</button>
                )}
                {lead && s.status === 'PLANNED' && (
                  <button className="rounded-lg p-1.5 text-muted hover:text-rose-600" aria-label="Delete sprint" onClick={() => confirm(`Delete ${s.name}? Its tasks move to the backlog.`) && deleteSprint(s.id)}><Trash2 size={15} /></button>
                )}
              </div>
            </header>
            {bd && bd.total > 0 && <div className="border-b border-line px-4 py-3"><div className="max-w-2xl"><Burndown points={bd.points} total={bd.total} /></div></div>}
            <ul className="divide-y divide-line">{st.map((t) => <Row key={t.id} t={t} />)}</ul>
            {!st.length && <p className="px-4 py-6 text-center text-sm text-muted">Drag tasks here from the backlog.</p>}
          </section>
        );
      })}
      <section className={cx('card overflow-hidden', dropOn === 'backlog' && 'ring-2 ring-brand')} {...dropProps(null)}>
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 className="font-semibold">Backlog</h3>
            <p className="text-xs text-muted">{backlog.length} tasks · {backlog.reduce((a, t) => a + t.points, 0)} pt · drag a task onto a sprint to plan it</p>
          </div>
          <button className="btn-ghost ml-auto py-1.5 text-xs" onClick={() => openNewTask({ projectId, sprintId: null })}><Plus size={14} /> Task</button>
        </header>
        <ul className="divide-y divide-line">{backlog.map((t) => <Row key={t.id} t={t} />)}</ul>
        {!backlog.length && <p className="px-4 py-6 text-center text-sm text-muted">Backlog is empty.</p>}
      </section>
      {completed.length > 0 && (
        <section className="card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><Rocket size={16} className="text-brand" /> Completed sprints · velocity</h3>
          <ul className="space-y-2">
            {completed.map((s) => {
              const pts = tasks.filter((t) => t.sprintId === s.id && t.status === 'DONE').reduce((a, t) => a + t.points, 0);
              return (
                <li key={s.id} className="flex items-center gap-3 text-sm">
                  <span className="w-24 font-medium">{s.name}</span>
                  <span className="w-40 text-xs text-muted">{fmtDate(s.startDate)} – {fmtDate(s.endDate)}</span>
                  <Progress value={Math.min(100, pts * 3)} className="flex-1" />
                  <span className="w-14 text-right text-xs font-semibold">{pts} pt</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <SprintModal open={planning} onClose={() => setPlanning(false)} projectId={projectId} count={sprints.length + 2} />
    </div>
  );
}

function ProjectActivity({ projectId }: { projectId: string }) {
  const users = useStore((s) => s.users);
  const tick = useStore((s) => s.tick);
  const { open } = useTaskParam();
  const [rows, setRows] = useState<Activity[] | null>(null);
  useEffect(() => {
    backend().listActivity({ projectId, limit: 100 }).then(setRows).catch(() => setRows([]));
  }, [projectId, tick]);
  if (!rows) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <div className="card divide-y divide-line">
      {rows.map((a) => {
        const u = users.find((x) => x.id === a.actorId);
        return (
          <button key={a.id} disabled={!a.taskId} onClick={() => a.taskId && open(a.taskId)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm enabled:hover:bg-surface-2">
            <Avatar user={u} size={28} />
            <span className="min-w-0 flex-1"><b>{u?.name ?? 'System'}</b> <span className="text-muted">{a.message}</span></span>
            <span className="shrink-0 text-xs text-muted">{relTime(a.createdAt)}</span>
          </button>
        );
      })}
      {!rows.length && <p className="p-6 text-center text-sm text-muted">No activity yet.</p>}
    </div>
  );
}

