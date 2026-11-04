'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, Bug, ChevronDown, Sparkles, Wrench, X } from 'lucide-react';
import type { Priority, Role, TaskStatus, TaskType, User } from '@/lib/types';
import { ROLE_LABEL, STATUS_LABEL } from '@/lib/types';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function fmtDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  if (!d) return '—';
  const date = d.length === 10 ? new Date(d + 'T00:00:00') : new Date(d);
  return date.toLocaleDateString('en-GB', opts);
}

export function relTime(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return fmtDate(iso);
}

export function daysLeft(date: string | null) {
  if (!date) return null;
  return Math.round((new Date(date + 'T00:00:00').getTime() - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime()) / 86400000);
}

export function Avatar({ user, size = 28, online, ring }: { user?: Pick<User, 'name' | 'color'> | null; size?: number; online?: boolean; ring?: boolean }) {
  if (!user)
    return (
      <span className="inline-grid shrink-0 place-items-center rounded-full border border-dashed border-line text-[10px] text-muted" style={{ width: size, height: size }} title="Unassigned">
        ?
      </span>
    );
  return (
    <span className="relative inline-block shrink-0" title={user.name}>
      <span
        className={cx('grid place-items-center rounded-full font-semibold text-white', ring && 'ring-2 ring-surface')}
        style={{ width: size, height: size, background: user.color, fontSize: Math.max(9, size * 0.38) }}
      >
        {initials(user.name)}
      </span>
      {online !== undefined && (
        <span className={cx('absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface', online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600')} />
      )}
    </span>
  );
}

export function AvatarStack({ users, max = 4, size = 26 }: { users: User[]; max?: number; size?: number }) {
  return (
    <div className="flex -space-x-2">
      {users.slice(0, max).map((u) => (
        <Avatar key={u.id} user={u} size={size} ring />
      ))}
      {users.length > max && (
        <span className="grid place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted ring-2 ring-surface" style={{ width: size, height: size }}>
          +{users.length - max}
        </span>
      )}
    </div>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  MEDIUM: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  HIGH: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  URGENT: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};
export function PriorityBadge({ p }: { p: Priority }) {
  return <span className={cx('chip', PRIORITY_STYLE[p])}>{p === 'URGENT' && <AlertTriangle size={10} />}{p[0] + p.slice(1).toLowerCase()}</span>;
}

export function TypeIcon({ t, size = 14 }: { t: TaskType; size?: number }) {
  if (t === 'BUG') return <Bug size={size} className="text-rose-500" aria-label="Bug" />;
  if (t === 'CHORE') return <Wrench size={size} className="text-slate-500" aria-label="Chore" />;
  return <Sparkles size={size} className="text-brand" aria-label="Feature" />;
}

export const STATUS_COLOR: Record<TaskStatus, string> = { TODO: '#94a3b8', IN_PROGRESS: '#6457f9', REVIEW: '#f59e0b', DONE: '#10b981' };

export function StatusPill({ s }: { s: TaskStatus }) {
  return (
    <span className="chip bg-surface-2 text-ink">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
      {STATUS_LABEL[s]}
    </span>
  );
}

const ROLE_STYLE: Record<Role, string> = {
  ADMIN: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900',
  PM: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  DEVELOPER: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  TESTER: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
};
export function RoleBadge({ role }: { role: Role }) {
  return <span className={cx('chip', ROLE_STYLE[role])}>{ROLE_LABEL[role]}</span>;
}

export function Progress({ value, color = 'var(--brand)', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-surface-2', !/\bw-/.test(className ?? '') && 'w-full', className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,textarea,select')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx('card max-h-[90vh] w-full overflow-y-auto p-5', wide ? 'max-w-2xl' : 'max-w-lg')}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="rounded-lg p-1 text-muted hover:bg-surface-2" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Select({ value, onChange, children, className, disabled, ariaLabel }: { value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string; disabled?: boolean; ariaLabel?: string }) {
  return (
    <div className={cx('relative', className)}>
      <select aria-label={ariaLabel} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="input appearance-none pr-8 disabled:opacity-60">
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">{icon}</div>
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
