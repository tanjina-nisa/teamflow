import { createDemoBackend } from './demo';
import { createHttpBackend } from './http';
import type { Backend } from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

let instance: Backend | null = null;

/** Real NestJS API when NEXT_PUBLIC_API_URL is set, otherwise the in-browser demo backend. */
export function backend(): Backend {
  if (!instance) instance = API_URL ? createHttpBackend(API_URL) : createDemoBackend();
  return instance;
}

export type { Backend } from './types';
