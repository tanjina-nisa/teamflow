'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { create } from 'zustand';
import type { TaskStatus } from './types';

interface UIState {
  newTask: { open: boolean; projectId?: string; status?: TaskStatus; sprintId?: string | null };
  openNewTask(o?: { projectId?: string; status?: TaskStatus; sprintId?: string | null }): void;
  closeNewTask(): void;
  sidebar: boolean;
  setSidebar(v: boolean): void;
}

export const useUI = create<UIState>()((set) => ({
  newTask: { open: false },
  openNewTask: (o = {}) => set({ newTask: { open: true, ...o } }),
  closeNewTask: () => set({ newTask: { open: false } }),
  sidebar: false,
  setSidebar: (v) => set({ sidebar: v }),
}));

/** The task drawer is driven by ?task=<id> so links from notifications and activity just work. */
export function useTaskParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const taskId = params.get('task');
  const open = useCallback(
    (id: string | null) => {
      const q = new URLSearchParams(params.toString());
      if (id) q.set('task', id);
      else q.delete('task');
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return { taskId, open };
}
