'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthSide } from '@/components/auth-side';
import { backend } from '@/lib/backend';
import { useStore } from '@/lib/store';
import { DEMO_PASSWORD, SEED_USERS } from '@/lib/seed-data';
import { ROLE_LABEL } from '@/lib/types';
import { Avatar } from '@/components/ui';
import { Toasts } from '@/components/shell';

const QUICK = ['ADMIN', 'PM', 'DEVELOPER', 'TESTER'].map((r) => SEED_USERS.find((u) => u.role === r)!);

export default function LoginPage() {
  const login = useStore((s) => s.login);
  const status = useStore((s) => s.status);
  const init = useStore((s) => s.init);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const demo = backend().mode === 'demo';

  useEffect(() => {
    void init();
  }, [init]);
  useEffect(() => {
    if (status === 'ready') router.replace('/dashboard');
  }, [status, router]);

  const go = async (e: string, p: string, key: string) => {
    setBusy(key);
    setError('');
    try {
      await login(e, p);
      router.replace('/dashboard');
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <AuthSide />
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <img src="/icon.svg" alt="" className="h-9 w-9" />
            <span className="text-lg font-bold">TeamFlow</span>
          </div>
          <h2 className="text-2xl font-bold">Welcome back</h2>
          <p className="mt-1 text-sm text-muted">Sign in to your workspace.</p>

          {demo && (
            <div className="mt-6">
              <p className="label">One-click demo login</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK.map((u) => (
                  <button key={u.key} className="btn-ghost justify-start gap-2.5 py-2.5 text-left" disabled={!!busy} onClick={() => go(u.email, DEMO_PASSWORD, u.key)}>
                    {busy === u.key ? <Loader2 size={22} className="animate-spin text-brand" /> : <Avatar user={u} size={22} />}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">{ROLE_LABEL[u.role]}</span>
                      <span className="block truncate text-[11px] font-normal text-muted">{u.name}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="my-6 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" /> or use email <span className="h-px flex-1 bg-line" /></div>
            </div>
          )}

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void go(email, password, 'form');
            }}
          >
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</p>}
            <button className="btn-primary w-full py-2.5" disabled={!!busy}>{busy === 'form' && <Loader2 size={16} className="animate-spin" />} Sign in</button>
          </form>
          {demo && <p className="mt-3 text-center text-xs text-muted">Demo accounts use the password <code className="rounded bg-surface-2 px-1">{DEMO_PASSWORD}</code></p>}
          <p className="mt-6 text-center text-sm text-muted">
            New company? <Link href="/register" className="font-semibold text-brand">Create a workspace</Link>
          </p>
        </div>
      </div>
      <Toasts />
    </div>
  );
}
