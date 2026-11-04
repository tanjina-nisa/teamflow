'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Loader2, MessageSquare, Paperclip, Trash2, Upload, X, Activity as ActivityIcon } from 'lucide-react';
import { backend } from '@/lib/backend';
import { useStore } from '@/lib/store';
import { useTaskParam } from '@/lib/ui';
import { canDeleteTasks, checkTaskRules, isLead, isOverdue } from '@/lib/logic';
import { ApiError, PRIORITIES, STATUSES, STATUS_LABEL, type Activity, type Attachment, type Comment, type TaskPatch } from '@/lib/types';
import { Avatar, PriorityBadge, Select, TypeIcon, cx, fmtDate, relTime } from './ui';

function fmtSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

function Body({ text }: { text: string }) {
  return <>{text.split(/(@[A-Za-z][\w-]*)/g).map((part, i) => (part.startsWith('@') ? <span key={i} className="font-semibold text-brand">{part}</span> : part))}</>;
}

export function TaskDrawer() {
  const { taskId, open } = useTaskParam();
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId));
  const projects = useStore((s) => s.projects);
  const users = useStore((s) => s.users);
  const sprints = useStore((s) => s.sprints);
  const me = useStore((s) => s.me);
  const tick = useStore((s) => s.tick);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const toast = useStore((s) => s.toast);

  const [tab, setTab] = useState<'comments' | 'files' | 'activity'>('comments');
  const [comments, setComments] = useState<Comment[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [acts, setActs] = useState<Activity[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const project = projects.find((p) => p.id === task?.projectId);
  const members = useMemo(() => users.filter((u) => project?.memberIds.includes(u.id) && u.active), [users, project]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  useEffect(() => {
    setTitle(task?.title ?? '');
    setDesc(task?.description ?? '');
  }, [task?.id, task?.title, task?.description]);

  useEffect(() => {
    if (!taskId || !task) return;
    let alive = true;
    const b = backend();
    Promise.all([b.listComments(taskId), b.listAttachments(taskId), b.listActivity({ taskId, limit: 50 })])
      .then(([c, f, a]) => {
        if (!alive) return;
        setComments(c);
        setFiles(f);
        setActs(a);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [taskId, tick, !!task]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && open(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [taskId, open]);

  if (!taskId) return null;
  if (!task || !project || !me) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/30" onClick={() => open(null)}>
        <div className="card p-6 text-sm">Task not found or you don’t have access. <button className="ml-2 text-brand" onClick={() => open(null)}>Close</button></div>
      </div>
    );
  }

  const lead = isLead(me.role);
  const patch = (p: TaskPatch) => {
    try {
      checkTaskRules(me, task, p);
    } catch (e) {
      return toast({ kind: 'error', title: (e as ApiError).message });
    }
    void updateTask(task.id, p);
  };
  const projectSprints = sprints.filter((s) => s.projectId === project.id && s.status !== 'COMPLETED');
  const assigneeOptions = lead ? members : members.filter((u) => u.id === me.id || u.id === task.assigneeId);

  const send = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const c = await backend().addComment(task.id, draft);
      setComments((x) => (x.some((y) => y.id === c.id) ? x : [...x, c]));
      setDraft('');
    } catch (e) {
      toast({ kind: 'error', title: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(list)) {
        const a = await backend().uploadAttachment(task.id, f);
        setFiles((x) => (x.some((y) => y.id === a.id) ? x : [...x, a]));
      }
      toast({ kind: 'success', title: 'File attached' });
    } catch (e) {
      toast({ kind: 'error', title: (e as Error).message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30 backdrop-blur-[1px]" onMouseDown={(e) => e.target === e.currentTarget && open(null)}>
      <aside role="dialog" aria-label={`Task ${project.key}-${task.number}`} className="flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: project.color }} />
          <span className="font-medium text-muted">{project.name}</span>
          <span className="text-muted">/</span>
          <span className="inline-flex items-center gap-1 font-semibold"><TypeIcon t={task.type} /> {project.key}-{task.number}</span>
          <div className="ml-auto flex items-center gap-1">
            {canDeleteTasks(me.role) && (
              <button
                className="rounded-lg p-2 text-muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                aria-label="Delete task"
                onClick={async () => {
                  if (!confirm(`Delete ${project.key}-${task.number}?`)) return;
                  await deleteTask(task.id);
                  open(null);
                  toast({ kind: 'success', title: 'Task deleted' });
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button className="rounded-lg p-2 text-muted hover:bg-surface-2" onClick={() => open(null)} aria-label="Close task">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })}
            rows={1}
            aria-label="Title"
            className="w-full resize-none rounded-lg bg-transparent text-xl font-bold outline-none focus:bg-surface-2 focus:px-2"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <PriorityBadge p={task.priority} />
            {isOverdue(task) && <span className="chip bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">Overdue</span>}
            <span>Created {relTime(task.createdAt)} by {userById.get(task.reporterId ?? '')?.name ?? 'someone'}</span>
            {task.completedAt && <span>· Done {relTime(task.completedAt)}</span>}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <dt className="label">Status</dt>
              <Select ariaLabel="Status" value={task.status} onChange={(v) => patch({ status: v as typeof task.status })}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </Select>
            </div>
            <div>
              <dt className="label">Assignee</dt>
              <Select ariaLabel="Assignee" value={task.assigneeId ?? ''} onChange={(v) => patch({ assigneeId: v || null })}>
                <option value="">Unassigned</option>
                {assigneeOptions.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === me.id ? ' (me)' : ''}</option>)}
              </Select>
            </div>
            <div>
              <dt className="label">Priority</dt>
              <Select ariaLabel="Priority" value={task.priority} onChange={(v) => patch({ priority: v as typeof task.priority })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}
              </Select>
            </div>
            <div>
              <dt className="label">Type</dt>
              <Select ariaLabel="Type" value={task.type} onChange={(v) => patch({ type: v as typeof task.type })}>
                <option value="FEATURE">Feature</option>
                <option value="BUG">Bug</option>
                <option value="CHORE">Chore</option>
              </Select>
            </div>
            <div>
              <dt className="label">Sprint</dt>
              <Select ariaLabel="Sprint" value={task.sprintId ?? ''} onChange={(v) => patch({ sprintId: v || null })}>
                <option value="">Backlog</option>
                {projectSprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === 'ACTIVE' ? ' (active)' : ''}</option>)}
                {task.sprintId && !projectSprints.some((s) => s.id === task.sprintId) && <option value={task.sprintId}>Completed sprint</option>}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="label">Points</dt>
                <input aria-label="Story points" type="number" min={0} max={100} className="input" value={task.points} onChange={(e) => patch({ points: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
              </div>
              <div>
                <dt className="label">Due</dt>
                <input aria-label="Due date" type="date" className="input px-2" value={task.dueDate ?? ''} onChange={(e) => patch({ dueDate: e.target.value || null })} />
              </div>
            </div>
          </dl>

          <div className="mt-3">
            <span className="label">Labels</span>
            <input
              className="input"
              placeholder="comma separated, e.g. billing, api"
              defaultValue={task.labels.join(', ')}
              key={task.labels.join(',')}
              onBlur={(e) => {
                const labels = [...new Set(e.target.value.split(',').map((x) => x.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean))].slice(0, 10);
                if (labels.join() !== task.labels.join()) patch({ labels });
              }}
            />
          </div>

          <div className="mt-3">
            <span className="label">Description</span>
            <textarea
              className="input min-h-24"
              placeholder="Add details, acceptance criteria, links…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={() => desc !== task.description && patch({ description: desc })}
            />
          </div>

          <div className="mt-5 flex gap-1 border-b border-line text-sm">
            {([
              ['comments', MessageSquare, `Comments (${comments.length})`],
              ['files', Paperclip, `Files (${files.length})`],
              ['activity', ActivityIcon, 'Activity'],
            ] as const).map(([k, Icon, label]) => (
              <button key={k} onClick={() => setTab(k)} className={cx('-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium', tab === k ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {tab === 'comments' && (
            <div className="space-y-4 py-4">
              {comments.map((c) => {
                const a = userById.get(c.authorId);
                return (
                  <div key={c.id} className="flex gap-3">
                    <Avatar user={a} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm"><span className="font-semibold">{a?.name ?? 'Unknown'}</span> <span className="text-xs text-muted">{relTime(c.createdAt)}</span></p>
                      <p className="mt-0.5 text-sm whitespace-pre-wrap"><Body text={c.body} /></p>
                    </div>
                  </div>
                );
              })}
              {!comments.length && <p className="text-sm text-muted">No comments yet. Mention a teammate with @firstname.</p>}
              <div className="flex gap-3">
                <Avatar user={me} size={30} />
                <div className="flex-1">
                  <textarea
                    className="input min-h-20"
                    placeholder="Write a comment… use @name to notify someone"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send()}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-muted">Ctrl + Enter to send</span>
                    <button className="btn-primary" disabled={busy || !draft.trim()} onClick={send}>
                      {busy && <Loader2 size={14} className="animate-spin" />} Comment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'files' && (
            <div className="py-4">
              <label
                className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-line p-5 text-center text-sm text-muted hover:border-brand hover:text-ink"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void upload(e.dataTransfer.files);
                }}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                <span><b className="text-ink">Click to upload</b> or drop files here</span>
                <span className="text-[11px]">{backend().mode === 'demo' ? 'Demo mode: up to 1.5 MB, stored in this browser' : 'Up to 10 MB'}</span>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
              </label>
              <ul className="mt-3 space-y-2">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                    <FileText size={18} className="shrink-0 text-brand" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.filename}</p>
                      <p className="text-[11px] text-muted">{fmtSize(f.size)} · {userById.get(f.uploaderId)?.name} · {relTime(f.createdAt)}</p>
                    </div>
                    <button className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Download" onClick={() => backend().downloadAttachment(f).catch((e) => toast({ kind: 'error', title: e.message }))}>
                      <Download size={15} />
                    </button>
                    {(f.uploaderId === me.id || lead) && (
                      <button
                        className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                        aria-label="Delete file"
                        onClick={async () => {
                          await backend().deleteAttachment(f);
                          setFiles((x) => x.filter((y) => y.id !== f.id));
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'activity' && (
            <ol className="relative space-y-3 py-4 pl-4 before:absolute before:top-5 before:bottom-5 before:left-[5px] before:w-px before:bg-line">
              {acts.map((a) => (
                <li key={a.id} className="relative text-sm">
                  <span className="absolute top-1.5 -left-4 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand" />
                  <span className="font-semibold">{userById.get(a.actorId ?? '')?.name ?? 'System'}</span> {a.message}
                  <span className="block text-[11px] text-muted">{fmtDate(a.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </li>
              ))}
              {!acts.length && <p className="text-sm text-muted">No activity yet.</p>}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
