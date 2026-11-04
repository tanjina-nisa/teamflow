'use client';

import { useMemo, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { useStore } from '@/lib/store';
import { buildWorkload, canManageUsers } from '@/lib/logic';
import { ROLE_LABEL, type Role } from '@/lib/types';
import { Avatar, Modal, PageHeader, RoleBadge, STATUS_COLOR, Select, cx } from '@/components/ui';

const ROLES: Role[] = ['ADMIN', 'PM', 'DEVELOPER', 'TESTER'];

export default function TeamPage() {
  const me = useStore((s) => s.me)!;
  const users = useStore((s) => s.users);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const online = useStore((s) => s.online);
  const updateUser = useStore((s) => s.updateUser);
  const [inviting, setInviting] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');

  const workload = useMemo(() => buildWorkload(tasks, users).sort((a, b) => b.utilization - a.utilization), [tasks, users]);
  const admin = canManageUsers(me.role);
  const isOnline = (id: string) => id === me.id || Date.now() - (online[id] ?? 0) < 40000;
  const max = Math.max(...workload.map((w) => Math.max(w.openPoints, w.user.capacity)), 1) * 1.08;
  const overloaded = workload.filter((w) => w.utilization > 100).length;
  const avg = workload.length ? Math.round(workload.reduce((a, w) => a + w.utilization, 0) / workload.length) : 0;

  return (
    <>
      <PageHeader
        title="Team & workload"
        subtitle={`${users.filter((u) => u.active).length} active members · average utilization ${avg}% · ${overloaded} overloaded`}
        actions={admin && <button className="btn-primary" onClick={() => setInviting(true)}><UserPlus size={16} /> Add member</button>}
      />

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <h2 className="font-semibold">Open story points vs. sprint capacity</h2>
          <div className="ml-auto flex flex-wrap gap-3 text-xs text-muted">
            {(['TODO', 'IN_PROGRESS', 'REVIEW'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLOR[s] }} /> {s === 'TODO' ? 'To do' : s === 'IN_PROGRESS' ? 'In progress' : 'Review'}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 bg-ink" /> Capacity</span>
          </div>
        </div>
        <ul className="space-y-4">
          {workload.map((w) => {
            const state = w.utilization > 100 ? ['Overloaded', 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'] : w.utilization >= 80 ? ['Busy', 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'] : ['Available', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'];
            return (
              <li key={w.user.id} className="grid items-center gap-3 sm:grid-cols-[220px_1fr_190px]">
                <div className="flex items-center gap-3">
                  <Avatar user={w.user} size={34} online={isOnline(w.user.id)} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{w.user.name}</p>
                    <p className="truncate text-[11px] text-muted">{w.user.title || ROLE_LABEL[w.user.role]}</p>
                  </div>
                </div>
                <div className="relative h-6 overflow-hidden rounded-lg bg-surface-2" title={`${w.openPoints} of ${w.user.capacity} points`}>
                  {(() => {
                    let x = 0;
                    return (['TODO', 'IN_PROGRESS', 'REVIEW'] as const).map((s) => {
                      const width = (w.byStatus[s] / max) * 100;
                      const el = <div key={s} className="absolute inset-y-0" style={{ left: `${x}%`, width: `${width}%`, background: STATUS_COLOR[s] }} />;
                      x += width;
                      return el;
                    });
                  })()}
                  <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${(w.user.capacity / max) * 100}%` }} />
                </div>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <span className="text-sm font-semibold whitespace-nowrap tabular-nums">{w.openPoints}/{w.user.capacity} pt</span>
                  <span className={cx('chip whitespace-nowrap', state[1])}>{state[0]} · {w.utilization}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card mt-4 overflow-x-auto">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <h2 className="font-semibold">Members</h2>
          <Select className="ml-auto w-44" ariaLabel="Role filter" value={roleFilter} onChange={(v) => setRoleFilter(v as Role | '')}>
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </div>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr><th className="px-5 py-2.5 font-medium">Name</th><th className="px-3 font-medium">Role</th><th className="px-3 font-medium">Projects</th><th className="px-3 font-medium">Open tasks</th><th className="px-3 font-medium">Capacity (pt)</th><th className="px-5 font-medium">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.filter((u) => !roleFilter || u.role === roleFilter).map((u) => {
              const w = workload.find((x) => x.user.id === u.id);
              return (
                <tr key={u.id} className={cx(!u.active && 'opacity-50')}>
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-2.5"><Avatar user={u} size={30} online={u.active ? isOnline(u.id) : undefined} /><span><span className="block font-medium">{u.name}{u.id === me.id && <span className="text-muted"> (you)</span>}</span><span className="text-[11px] text-muted">{u.email}</span></span></span>
                  </td>
                  <td className="px-3">
                    {admin && u.id !== me.id ? (
                      <Select className="w-40" ariaLabel={`Role for ${u.name}`} value={u.role} onChange={(v) => updateUser(u.id, { role: v as Role })}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </Select>
                    ) : <RoleBadge role={u.role} />}
                  </td>
                  <td className="px-3 text-xs text-muted">{projects.filter((p) => p.memberIds.includes(u.id)).map((p) => p.key).join(', ') || '—'}</td>
                  <td className="px-3 tabular-nums">{w?.openTasks ?? 0}{w?.overdue ? <span className="ml-1 text-xs font-semibold text-rose-600">({w.overdue} late)</span> : null}</td>
                  <td className="px-3">
                    {admin ? (
                      <input aria-label={`Capacity for ${u.name}`} type="number" min={1} max={200} className="input w-20 py-1" defaultValue={u.capacity} onBlur={(e) => Number(e.target.value) !== u.capacity && updateUser(u.id, { capacity: Math.max(1, Number(e.target.value) || 1) })} />
                    ) : <span className="tabular-nums">{u.capacity}</span>}
                  </td>
                  <td className="px-5">
                    {admin && u.id !== me.id ? (
                      <button className={cx('chip', u.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')} onClick={() => updateUser(u.id, { active: !u.active })}>
                        {u.active ? 'Active' : 'Deactivated'}
                      </button>
                    ) : <span className="text-xs text-muted">{u.active ? 'Active' : 'Deactivated'}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <InviteModal open={inviting} onClose={() => setInviting(false)} />
    </>
  );
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inviteUser = useStore((s) => s.inviteUser);
  const toast = useStore((s) => s.toast);
  const [f, setF] = useState({ name: '', email: '', role: 'DEVELOPER' as Role, title: '', password: '' });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Add a team member">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const u = await inviteUser(f);
            toast({ kind: 'success', title: `${u.name} added`, body: `They can sign in with ${u.email}` });
            setF({ name: '', email: '', role: 'DEVELOPER', title: '', password: '' });
            onClose();
          } catch { /* toasted */ } finally {
            setBusy(false);
          }
        }}
      >
        <div><label className="label" htmlFor="iv-name">Name</label><input id="iv-name" className="input" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label" htmlFor="iv-email">Email</label><input id="iv-email" type="email" className="input" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><span className="label">Role</span><Select ariaLabel="Role" value={f.role} onChange={(v) => setF({ ...f, role: v as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></div>
        <div><label className="label" htmlFor="iv-title">Job title</label><input id="iv-title" className="input" placeholder="e.g. QA Engineer" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="iv-pw">Temporary password</label><input id="iv-pw" className="input" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="At least 8 characters — share it privately" /></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} Add member</button></div>
      </form>
    </Modal>
  );
}
