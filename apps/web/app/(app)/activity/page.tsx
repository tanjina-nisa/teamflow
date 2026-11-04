'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { backend } from '@/lib/backend';
import { useStore } from '@/lib/store';
import { useTaskParam } from '@/lib/ui';
import { downloadBlob } from '@/lib/logic';
import type { Activity } from '@/lib/types';
import { Avatar, PageHeader, Select, fmtDate } from '@/components/ui';

const KINDS: Record<string, string> = {
  '': 'All events', task: 'Tasks', comment: 'Comments', attachment: 'Files', sprint: 'Sprints', project: 'Projects', user: 'Team changes',
};

export default function ActivityPage() {
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const tick = useStore((s) => s.tick);
  const { open } = useTaskParam();
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [projectId, setProjectId] = useState('');
  const [kind, setKind] = useState('');
  const [actor, setActor] = useState('');

  useEffect(() => {
    backend().listActivity({ projectId: projectId || undefined, limit: 300 }).then(setRows).catch(() => setRows([]));
  }, [projectId, tick]);

  const list = useMemo(() => (rows ?? []).filter((a) => (!kind || a.action.startsWith(kind)) && (!actor || a.actorId === actor)), [rows, kind, actor]);
  const groups = useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const a of list) {
      const d = a.createdAt.slice(0, 10);
      m.set(d, [...(m.get(d) ?? []), a]);
    }
    return [...m.entries()];
  }, [list]);
  const un = new Map(users.map((u) => [u.id, u]));
  const pk = new Map(projects.map((p) => [p.id, p]));

  return (
    <>
      <PageHeader
        title="Activity log"
        subtitle="An audit trail of every change in your workspace"
        actions={
          <>
            <Select className="w-44" ariaLabel="Project" value={projectId} onChange={setProjectId}><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select className="w-40" ariaLabel="Event type" value={kind} onChange={setKind}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Select className="w-44" ariaLabel="Person" value={actor} onChange={setActor}><option value="">Everyone</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
            <button
              className="btn-ghost"
              onClick={() => {
                const csv = ['Time,Who,Project,Action,Message', ...list.map((a) => [a.createdAt, un.get(a.actorId ?? '')?.name ?? '', pk.get(a.projectId ?? '')?.key ?? '', a.action, `"${a.message.replace(/"/g, '""')}"`].join(','))].join('\n');
                downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv' }), 'teamflow-activity.csv');
              }}
            >
              <Download size={15} /> Export
            </button>
          </>
        }
      />
      {!rows ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
              <div className="card divide-y divide-line">
                {items.map((a) => {
                  const u = un.get(a.actorId ?? '');
                  const p = pk.get(a.projectId ?? '');
                  return (
                    <button key={a.id} disabled={!a.taskId} onClick={() => a.taskId && open(a.taskId)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm enabled:hover:bg-surface-2">
                      <Avatar user={u} size={28} />
                      <span className="min-w-0 flex-1"><b>{u?.name ?? 'System'}</b> <span className="text-muted">{a.message}</span></span>
                      {p && <span className="chip hidden bg-surface-2 text-muted sm:inline-flex"><span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.key}</span>}
                      <span className="w-14 shrink-0 text-right text-xs text-muted">{new Date(a.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {!groups.length && <div className="card p-10 text-center text-sm text-muted">No activity matches these filters.</div>}
        </div>
      )}
    </>
  );
}
