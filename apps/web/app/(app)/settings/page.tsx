'use client';

import { useRouter } from 'next/navigation';
import { Database, RefreshCcw, Server, Shield, Wifi } from 'lucide-react';
import { API_URL, backend } from '@/lib/backend';
import { resetDemoData } from '@/lib/backend/demo';
import { useStore } from '@/lib/store';
import { ROLE_LABEL, type Role } from '@/lib/types';
import { PageHeader, RoleBadge } from '@/components/ui';

const MATRIX: [string, Role[]][] = [
  ['View projects they belong to, create & update tasks, comment, attach files', ['ADMIN', 'PM', 'DEVELOPER', 'TESTER']],
  ['Move tasks to Done (QA gate)', ['ADMIN', 'PM', 'TESTER']],
  ['Assign tasks to other people', ['ADMIN', 'PM']],
  ['Create / edit projects, plan / start / complete sprints, delete tasks', ['ADMIN', 'PM']],
  ['See every project and the team workload report', ['ADMIN', 'PM']],
  ['Add members, change roles and capacity, deactivate accounts, delete projects', ['ADMIN']],
];

export default function SettingsPage() {
  const me = useStore((s) => s.me)!;
  const workspace = useStore((s) => s.workspace);
  const logout = useStore((s) => s.logout);
  const router = useRouter();
  const demo = backend().mode === 'demo';

  return (
    <>
      <PageHeader title="Settings" subtitle={workspace?.name} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">{demo ? <Database size={17} className="text-brand" /> : <Server size={17} className="text-brand" />} Backend</h2>
          {demo ? (
            <>
              <p className="text-sm text-muted">
                This deployment runs in <b className="text-ink">demo mode</b>: the full API is simulated in your browser and saved to localStorage, so you can try every
                feature without an account. Changes sync live between tabs. Set <code className="rounded bg-surface-2 px-1">NEXT_PUBLIC_API_URL</code> to the NestJS API to use PostgreSQL and Socket.IO.
              </p>
              <button
                className="btn-ghost mt-4"
                onClick={() => {
                  if (!confirm('Reset all demo data in this browser?')) return;
                  resetDemoData();
                  logout();
                  router.replace('/login');
                }}
              >
                <RefreshCcw size={15} /> Restore sample data
              </button>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted"><Wifi size={15} className="text-emerald-500" /> Connected to <code className="rounded bg-surface-2 px-1">{API_URL}</code> with live Socket.IO updates.</p>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Your account</h2>
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Name</dt><dd className="font-medium">{me.name}</dd>
            <dt className="text-muted">Email</dt><dd>{me.email}</dd>
            <dt className="text-muted">Role</dt><dd><RoleBadge role={me.role} /></dd>
            <dt className="text-muted">Capacity</dt><dd>{me.capacity} story points / sprint</dd>
          </dl>
        </section>
        <section className="card overflow-x-auto p-5 lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Shield size={17} className="text-brand" /> Role permissions</h2>
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-2 font-medium">Permission</th>{(['ADMIN', 'PM', 'DEVELOPER', 'TESTER'] as Role[]).map((r) => <th key={r} className="w-28 text-center font-medium">{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {MATRIX.map(([label, roles]) => (
                <tr key={label}><td className="py-2.5 pr-4">{label}</td>{(['ADMIN', 'PM', 'DEVELOPER', 'TESTER'] as Role[]).map((r) => <td key={r} className="text-center">{roles.includes(r) ? <span className="text-emerald-600">✓</span> : <span className="text-muted">—</span>}</td>)}</tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">The same rules are enforced by the API (NestJS guards) and by the demo backend.</p>
        </section>
      </div>
    </>
  );
}
