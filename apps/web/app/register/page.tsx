'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { backend } from '@/lib/backend';
import { useStore } from '@/lib/store';
import { AuthSide } from '@/components/auth-side';
import { Toasts } from '@/components/shell';

export default function RegisterPage() {
  const register = useStore((s) => s.register);
  const router = useRouter();
  const [f, setF] = useState({ workspaceName: '', name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const demo = backend().mode === 'demo';

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <AuthSide />
      <div className="flex items-center justify-center p-6">
        <form
          className="w-full max-w-sm space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (demo && !confirm('Demo mode keeps one workspace per browser. Creating a new one replaces the sample data (you can restore it in Settings). Continue?')) return;
            setBusy(true);
            setError('');
            try {
              await register(f);
              router.replace('/projects');
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
        >
          <h2 className="text-2xl font-bold">Create your workspace</h2>
          <p className="pb-3 text-sm text-muted">You’ll be the admin. Invite your team afterwards.</p>
          {([
            ['workspaceName', 'Company / workspace', 'text', 'Nexora Labs'],
            ['name', 'Your name', 'text', 'Tanjina Akter'],
            ['email', 'Work email', 'email', 'you@company.com'],
            ['password', 'Password (8+ characters)', 'password', ''],
          ] as const).map(([k, label, type, ph]) => (
            <div key={k}>
              <label className="label" htmlFor={k}>{label}</label>
              <input id={k} type={type} required minLength={k === 'password' ? 8 : 2} className="input" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</p>}
          <button className="btn-primary w-full py-2.5" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />} Create workspace</button>
          <p className="pt-3 text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-semibold text-brand">Sign in</Link></p>
        </form>
      </div>
      <Toasts />
    </div>
  );
}
