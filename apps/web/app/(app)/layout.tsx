'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Sidebar, Toasts, Topbar } from '@/components/shell';
import { TaskDrawer } from '@/components/task-drawer';
import { NewTaskModal } from '@/components/modals';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const status = useStore((s) => s.status);
  const init = useStore((s) => s.init);
  const router = useRouter();

  useEffect(() => {
    void init();
  }, [init]);
  useEffect(() => {
    if (status === 'anon') router.replace('/login');
  }, [status, router]);

  if (status !== 'ready') {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Loader2 className="animate-spin text-brand" size={20} /> Loading your workspace…
        </div>
      </div>
    );
  }

  return (
    <Suspense>
      <Sidebar />
      <div className="lg:pl-64">
        <Topbar />
        <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">{children}</main>
      </div>
      <TaskDrawer />
      <NewTaskModal />
      <Toasts />
    </Suspense>
  );
}
