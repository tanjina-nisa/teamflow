'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useTaskParam, useUI } from '@/lib/ui';
import { isLead, visibleProjects } from '@/lib/logic';
import { PRIORITIES, STATUSES, STATUS_LABEL, type Priority, type Project, type TaskStatus, type TaskType } from '@/lib/types';
import { Avatar, Modal, Select, cx } from './ui';

const COLORS = ['#6457f9', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];
const iso = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

export function NewTaskModal() {
  const { newTask, closeNewTask } = useUI();
  const me = useStore((s) => s.me);
  const projectsAll = useStore((s) => s.projects);
  const users = useStore((s) => s.users);
  const sprints = useStore((s) => s.sprints);
  const createTask = useStore((s) => s.createTask);
  const toast = useStore((s) => s.toast);
  const { open } = useTaskParam();
  const projects = useMemo(() => visibleProjects(projectsAll, me ?? undefined).filter((p) => p.status !== 'COMPLETED'), [projectsAll, me]);

  const [f, setF] = useState({ projectId: '', title: '', description: '', status: 'TODO' as TaskStatus, priority: 'MEDIUM' as Priority, type: 'FEATURE' as TaskType, assigneeId: '', sprintId: '', points: 3, dueDate: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!newTask.open) return;
    const projectId = newTask.projectId ?? projects[0]?.id ?? '';
    const active = sprints.find((s) => s.projectId === projectId && s.status === 'ACTIVE');
    setF((x) => ({
      ...x, title: '', description: '', projectId, status: newTask.status ?? 'TODO',
      sprintId: newTask.sprintId === undefined ? active?.id ?? '' : newTask.sprintId ?? '',
      assigneeId: me && !isLead(me.role) ? me.id : '', dueDate: '', points: 3, priority: 'MEDIUM', type: 'FEATURE',
    }));
  }, [newTask.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const project = projects.find((p) => p.id === f.projectId);
  const members = users.filter((u) => project?.memberIds.includes(u.id) && u.active);
  const assignable = me && isLead(me.role) ? members : members.filter((u) => u.id === me?.id);
  const projectSprints = sprints.filter((s) => s.projectId === f.projectId && s.status !== 'COMPLETED');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim() || !f.projectId) return;
    setBusy(true);
    try {
      const t = await createTask({
        projectId: f.projectId, title: f.title.trim(), description: f.description, status: f.status, priority: f.priority, type: f.type,
        assigneeId: f.assigneeId || null, sprintId: f.sprintId || null, points: f.points, dueDate: f.dueDate || null,
      });
      closeNewTask();
      toast({ kind: 'success', title: `${project?.key}-${t.number} created`, body: t.title });
      open(t.id);
    } catch {
      /* toast shown by store */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={newTask.open} onClose={closeNewTask} title="New task" wide>
      {!projects.length ? (
        <p className="text-sm text-muted">You are not a member of any active project yet.</p>
      ) : (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="nt-title">Title</label>
            <input id="nt-title" className="input" required maxLength={200} placeholder="e.g. Add CSV export to the reports page" value={f.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div>
            <span className="label">Project</span>
            <Select ariaLabel="Project" value={f.projectId} onChange={(v) => setF((x) => ({ ...x, projectId: v, sprintId: sprints.find((s) => s.projectId === v && s.status === 'ACTIVE')?.id ?? '', assigneeId: me && !isLead(me.role) ? me.id : '' }))}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.key} · {p.name}</option>)}
            </Select>
          </div>
          <div>
            <span className="label">Sprint</span>
            <Select ariaLabel="Sprint" value={f.sprintId} onChange={(v) => set('sprintId', v)}>
              <option value="">Backlog</option>
              {projectSprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === 'ACTIVE' ? ' (active)' : ''}</option>)}
            </Select>
          </div>
          <div>
            <span className="label">Assignee</span>
            <Select ariaLabel="Assignee" value={f.assigneeId} onChange={(v) => set('assigneeId', v)}>
              <option value="">Unassigned</option>
              {assignable.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.title || u.role}</option>)}
            </Select>
          </div>
          <div>
            <span className="label">Status</span>
            <Select ariaLabel="Status" value={f.status} onChange={(v) => set('status', v as TaskStatus)}>
              {STATUSES.filter((s) => s !== 'DONE').map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          </div>
          <div>
            <span className="label">Priority</span>
            <div className="grid grid-cols-4 gap-1">
              {PRIORITIES.map((p) => (
                <button type="button" key={p} onClick={() => set('priority', p)} className={cx('rounded-lg border px-1 py-1.5 text-xs font-semibold', f.priority === p ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:bg-surface-2')}>
                  {p[0] + p.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Type</span>
            <div className="grid grid-cols-3 gap-1">
              {(['FEATURE', 'BUG', 'CHORE'] as TaskType[]).map((t) => (
                <button type="button" key={t} onClick={() => set('type', t)} className={cx('rounded-lg border px-1 py-1.5 text-xs font-semibold', f.type === t ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:bg-surface-2')}>
                  {t[0] + t.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="nt-points">Story points</label>
            <input id="nt-points" type="number" min={0} max={100} className="input" value={f.points} onChange={(e) => set('points', Number(e.target.value) || 0)} />
          </div>
          <div>
            <label className="label" htmlFor="nt-due">Due date</label>
            <input id="nt-due" type="date" className="input" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="nt-desc">Description</label>
            <textarea id="nt-desc" className="input min-h-20" placeholder="Optional" value={f.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-ghost" onClick={closeNewTask}>Cancel</button>
            <button className="btn-primary" disabled={busy || !f.title.trim()}>{busy && <Loader2 size={14} className="animate-spin" />} Create task</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function ProjectModal({ open, onClose, project }: { open: boolean; onClose: () => void; project?: Project }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me);
  const createProject = useStore((s) => s.createProject);
  const updateProject = useStore((s) => s.updateProject);
  const toast = useStore((s) => s.toast);
  const [f, setF] = useState({ name: '', key: '', description: '', color: COLORS[0], startDate: iso(), dueDate: iso(30), memberIds: [] as string[], status: 'ACTIVE' as Project['status'] });
  const [busy, setBusy] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKeyTouched(!!project);
    setF(
      project
        ? { name: project.name, key: project.key, description: project.description, color: project.color, startDate: project.startDate ?? '', dueDate: project.dueDate ?? '', memberIds: project.memberIds, status: project.status }
        : { name: '', key: '', description: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], startDate: iso(), dueDate: iso(30), memberIds: me ? [me.id] : [], status: 'ACTIVE' },
    );
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoKey = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || '';
  const toggle = (id: string) => setF((x) => ({ ...x, memberIds: x.memberIds.includes(id) ? x.memberIds.filter((m) => m !== id) : [...x.memberIds, id] }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, startDate: f.startDate || null, dueDate: f.dueDate || null };
      if (project) {
        const { key: _k, ...rest } = body;
        await updateProject(project.id, rest);
        toast({ kind: 'success', title: 'Project updated' });
      } else {
        await createProject(body);
        toast({ kind: 'success', title: `Project ${f.key} created` });
      }
      onClose();
    } catch {
      /* store toasts */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={project ? 'Edit project' : 'New project'} wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-4">
          <label className="label" htmlFor="pj-name">Name</label>
          <input id="pj-name" className="input" required minLength={2} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value, key: keyTouched ? x.key : autoKey(e.target.value) }))} placeholder="e.g. Customer Portal Revamp" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pj-key">Key</label>
          <input id="pj-key" className="input font-mono uppercase" required disabled={!!project} pattern="[A-Z][A-Z0-9]{1,5}" title="2–6 capital letters or digits" value={f.key} onChange={(e) => { setKeyTouched(true); setF((x) => ({ ...x, key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) })); }} />
        </div>
        <div className="sm:col-span-6">
          <label className="label" htmlFor="pj-desc">Description</label>
          <textarea id="pj-desc" className="input min-h-16" value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pj-start">Start</label>
          <input id="pj-start" type="date" className="input" value={f.startDate} onChange={(e) => setF((x) => ({ ...x, startDate: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pj-due">Deadline</label>
          <input id="pj-due" type="date" className="input" value={f.dueDate} onChange={(e) => setF((x) => ({ ...x, dueDate: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <span className="label">Status</span>
          <Select ariaLabel="Project status" value={f.status} onChange={(v) => setF((x) => ({ ...x, status: v as Project['status'] }))}>
            <option value="ACTIVE">Active</option>
            <option value="ON_HOLD">On hold</option>
            <option value="COMPLETED">Completed</option>
          </Select>
        </div>
        <div className="sm:col-span-6">
          <span className="label">Color</span>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button type="button" key={c} aria-label={`Color ${c}`} onClick={() => setF((x) => ({ ...x, color: c }))} className={cx('h-7 w-7 rounded-full ring-offset-2 ring-offset-surface', f.color === c && 'ring-2 ring-ink')} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="sm:col-span-6">
          <span className="label">Team members ({f.memberIds.length})</span>
          <div className="grid max-h-52 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {users.filter((u) => u.active).map((u) => (
              <label key={u.id} className={cx('flex cursor-pointer items-center gap-2.5 rounded-xl border p-2 text-sm', f.memberIds.includes(u.id) ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2')}>
                <input type="checkbox" className="accent-[var(--brand)]" checked={f.memberIds.includes(u.id)} onChange={() => toggle(u.id)} />
                <Avatar user={u} size={24} />
                <span className="min-w-0 flex-1 truncate">{u.name}<span className="block text-[11px] text-muted">{u.title || u.role}</span></span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-6">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} {project ? 'Save' : 'Create project'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function SprintModal({ open, onClose, projectId, count }: { open: boolean; onClose: () => void; projectId: string; count: number }) {
  const createSprint = useStore((s) => s.createSprint);
  const toast = useStore((s) => s.toast);
  const [f, setF] = useState({ name: '', goal: '', startDate: iso(), endDate: iso(14) });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF({ name: `Sprint ${count + 1}`, goal: '', startDate: iso(), endDate: iso(14) });
  }, [open, count]);
  return (
    <Modal open={open} onClose={onClose} title="Plan a sprint">
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await createSprint(projectId, f);
            toast({ kind: 'success', title: `${f.name} planned` });
            onClose();
          } catch { /* toasted */ } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <label className="label" htmlFor="sp-name">Name</label>
          <input id="sp-name" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="sp-goal">Sprint goal</label>
          <input id="sp-goal" className="input" placeholder="What should this sprint deliver?" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="sp-start">Start</label>
            <input id="sp-start" type="date" required className="input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="sp-end">End</label>
            <input id="sp-end" type="date" required min={f.startDate} className="input" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>Plan sprint</button>
        </div>
      </form>
    </Modal>
  );
}
