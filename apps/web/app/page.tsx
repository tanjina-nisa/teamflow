'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    let token: string | null = null;
    try { token = localStorage.getItem('tf_token'); } catch { /* blocked */ }
    router.replace(token ? '/dashboard' : '/login');
  }, [router]);
  return null;
}
