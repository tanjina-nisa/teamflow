'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, BarChart3, Bell, CheckCircle2, FolderKanban, LayoutDashboard, ListTodo, LogOut, Menu, Moon, Plus, Repeat, Search,
  Settings, Sun, Users, X, Info, AlertTriangle,
} from 'lucide-react';
import { backend } from '@/lib/backend';
import { useStore } from '@/lib/store';
import { useTaskParam, useUI } from '@/lib/ui';
import { DEMO_PASSWORD, SEED_USERS } from '@/lib/seed-data';
import { ROLE_LABEL } from '@/lib/types';
import { Avatar, RoleBadge, cx, relTime } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/my-tasks', label: 'My tasks', icon: ListTodo },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/team', label: 'Team & workload', icon: Users },
  { href: '/activity', label: 'Activity log', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const workspace = useStore((s) => s.workspace);
  const { sidebar, setSidebar } = useUI();
  useEffect(() => setSidebar(false), [pathname, setSidebar]);

  return (
    <>
      {sidebar && <div className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setSidebar(false)} />}
      <aside className={cx('no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface transition-transform lg:translate-x-0', sidebar ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-16 items-center gap-2.5 px-5">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <div className="min-w-0">
            <p className="leading-tight font-bold">TeamFlow</p>
            <p className="truncate text-[11px] text-muted">{workspace?.name}</p>
          </div>
          <button className="ml-auto rounded-lg p-1 text-muted lg:hidden" onClick={() => setSidebar(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="space-y-0.5 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link key={href} href={href} prefetch className={cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition', active ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
                <Icon size={17} /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 px-5 text-[11px] font-semibold tracking-wider text-muted uppercase">Projects</div>
        <div className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {projects.map((p) => {
            const pt = tasks.filter((t) => t.projectId === p.id);
            const open = pt.filter((t) => t.status !== 'DONE').length;
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className={cx('flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm', pathname === `/projects/${p.id}` ? 'bg-surface-2 font-semibold' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: p.color }} />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto text-[11px] tabular-nums">{open}</span>
              </Link>
            );
          })}
        </div>
        <div className="m-3 rounded-2xl bg-gradient-to-br from-[#6457f9] to-[#8b5cf6] p-4 text-white">
          <p className="text-sm font-semibold">{backend().mode === 'demo' ? 'Demo mode' : 'Connected to API'}</p>
          <p className="mt-1 text-xs text-white/80">{backend().mode === 'demo' ? 'Data is saved in this browser. Open a 2nd tab as another user to see live updates.' : 'Live updates over Socket.IO.'}</p>
        </div>
      </aside>
    </>
  );
}

function SearchBox() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const { open } = useTaskParam();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName))) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const pk = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return { tasks: [], projects: [] };
    return {
      projects: projects.filter((p) => p.name.toLowerCase().includes(s) || p.key.toLowerCase() === s).slice(0, 3),
      tasks: tasks.filter((t) => t.title.toLowerCase().includes(s) || `${pk.get(t.projectId)?.key}-${t.number}`.toLowerCase().includes(s) || t.labels.some((l) => l.includes(s))).slice(0, 7),
    };
  }, [q, tasks, projects, pk]);
  const show = focus && q.trim();
  return (
    <div className="relative w-full max-w-md">
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <input
        ref={ref}
        className="input pl-9"
        placeholder="Search tasks, keys, labels…  ( / )"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        aria-label="Search"
      />
      {show && (
        <div className="card absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden p-1">
          {results.projects.map((p) => (
            <button key={p.id} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2" onMouseDown={() => { router.push(`/projects/${p.id}`); setQ(''); }}>
              <span className="h-2.5 w-2.5 rounded" style={{ background: p.color }} /> {p.name} <span className="ml-auto text-xs text-muted">Project</span>
            </button>
          ))}
          {results.tasks.map((t) => (
            <button key={t.id} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2" onMouseDown={() => { open(t.id); setQ(''); }}>
              <span className="font-mono text-xs text-muted">{pk.get(t.projectId)?.key}-{t.number}</span>
              <span className="truncate">{t.title}</span>
            </button>
          ))}
          {!results.tasks.length && !results.projects.length && <p className="px-3 py-3 text-sm text-muted">No matches</p>}
        </div>
      )}
    </div>
  );
}

function Bellmenu() {
  const notifications = useStore((s) => s.notifications);
  const markRead = useStore((s) => s.markRead);
  const markAllRead = useStore((s) => s.markAllRead);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button className="relative rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-ink" onClick={() => setOpen((v) => !v)} aria-label={`Notifications, ${unread} unread`}>
        <Bell size={19} />
        {unread > 0 && <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-semibold">Notifications</p>
              {unread > 0 && <button className="text-xs font-medium text-brand" onClick={() => markAllRead()}>Mark all read</button>}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {notifications.slice(0, 20).map((n) => (
                <li key={n.id}>
                  <button
                    className={cx('flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-2', !n.read && 'bg-brand-soft/50')}
                    onClick={() => {
                      void markRead(n.id);
                      setOpen(false);
                      if (n.link) router.push(n.link);
                    }}
                  >
                    <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : n.type === 'deadline' ? 'bg-rose-500' : 'bg-brand')} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                      <span className="text-[11px] text-muted">{relTime(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {!notifications.length && <li className="px-4 py-8 text-center text-sm text-muted">You’re all caught up 🎉</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  return (
    <button
      className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-ink"
      aria-label="Toggle dark mode"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle('dark', next);
        try { localStorage.setItem('tf_theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
      }}
    >
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}

function UserMenu() {
  const me = useStore((s) => s.me);
  const logout = useStore((s) => s.logout);
  const login = useStore((s) => s.login);
  const users = useStore((s) => s.users);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const demo = backend().mode === 'demo';
  const switchable = users.filter((u) => u.active && u.id !== me.id && SEED_USERS.some((s) => s.email === u.email));
  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-surface-2" onClick={() => setOpen((v) => !v)} aria-label="Account menu">
        <Avatar user={me} size={32} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm leading-tight font-semibold">{me.name}</span>
          <span className="block text-[11px] text-muted">{ROLE_LABEL[me.role]}</span>
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 z-50 mt-2 w-72 overflow-hidden p-1">
            <div className="px-3 py-2.5">
              <p className="font-semibold">{me.name}</p>
              <p className="text-xs text-muted">{me.email}</p>
              <div className="mt-1.5"><RoleBadge role={me.role} /></div>
            </div>
            {demo && switchable.length > 0 && (
              <div className="border-t border-line py-1">
                <p className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase"><Repeat size={12} /> Switch demo user</p>
                {switchable.map((u) => (
                  <button
                    key={u.id}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-surface-2"
                    onClick={async () => {
                      setOpen(false);
                      logout();
                      await login(u.email, DEMO_PASSWORD);
                      router.refresh();
                    }}
                  >
                    <Avatar user={u} size={22} /> <span className="flex-1 truncate">{u.name}</span> <span className="text-[11px] text-muted">{ROLE_LABEL[u.role]}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="border-t border-line pt-1">
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-surface-2" onClick={() => { logout(); router.replace('/login'); }}>
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Topbar() {
  const openNewTask = useUI((s) => s.openNewTask);
  const setSidebar = useUI((s) => s.setSidebar);
  return (
    <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur md:px-6">
      <button className="rounded-xl p-2 text-muted hover:bg-surface-2 lg:hidden" onClick={() => setSidebar(true)} aria-label="Open menu"><Menu size={20} /></button>
      <SearchBox />
      <div className="ml-auto flex items-center gap-1">
        <button className="btn-primary hidden sm:inline-flex" onClick={() => openNewTask()}><Plus size={16} /> New task</button>
        <button className="btn-primary px-2.5 sm:hidden" onClick={() => openNewTask()} aria-label="New task"><Plus size={18} /></button>
        <ThemeToggle />
        <Bellmenu />
        <UserMenu />
      </div>
    </header>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismiss);
  return (
    <div className="no-print pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="card pointer-events-auto flex gap-3 p-3 shadow-lg">
          {t.kind === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" /> : t.kind === 'error' ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-500" /> : <Info size={18} className="mt-0.5 shrink-0 text-brand" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t.title}</p>
            {t.body && <p className="truncate text-xs text-muted">{t.body}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
