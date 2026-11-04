/**
 * Demo dataset shared by the API seed script and the web app's demo mode.
 * Keep this file dependency-free: it is copied verbatim to apps/web/lib/seed-data.ts.
 * Dates are relative to "now" so the demo always looks current.
 */

export type SeedRole = 'ADMIN' | 'PM' | 'DEVELOPER' | 'TESTER';
export type SeedStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

export interface SeedUser { key: string; name: string; email: string; role: SeedRole; title: string; color: string; capacity: number }
export interface SeedProject { key: string; name: string; description: string; color: string; startOffset: number; dueOffset: number; members: string[]; owner: string }
export interface SeedSprint { project: string; name: string; goal: string; startOffset: number; length: number; status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' }
export interface SeedTask {
  project: string; sprint: string | null; title: string; status: SeedStatus; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  type: 'FEATURE' | 'BUG' | 'CHORE'; assignee: string | null; reporter: string; points: number; dueOffset: number | null;
  labels: string[]; createdOffset: number; doneOffset?: number; description?: string;
}

export const DEMO_PASSWORD = 'teamflow123';

export const SEED_WORKSPACE = { name: 'Nexora Labs', slug: 'nexora-labs' };

export const SEED_USERS: SeedUser[] = [
  { key: 'rafiq', name: 'Rafiq Hasan', email: 'admin@teamflow.dev', role: 'ADMIN', title: 'CTO', color: '#0ea5e9', capacity: 20 },
  { key: 'tanjina', name: 'Tanjina Akter', email: 'pm@teamflow.dev', role: 'PM', title: 'Project Manager', color: '#8b5cf6', capacity: 20 },
  { key: 'arif', name: 'Arif Rahman', email: 'dev@teamflow.dev', role: 'DEVELOPER', title: 'Frontend Developer', color: '#6366f1', capacity: 26 },
  { key: 'nusrat', name: 'Nusrat Jahan', email: 'nusrat@teamflow.dev', role: 'DEVELOPER', title: 'Backend Developer', color: '#14b8a6', capacity: 26 },
  { key: 'samiul', name: 'Samiul Islam', email: 'samiul@teamflow.dev', role: 'DEVELOPER', title: 'Mobile Developer', color: '#f59e0b', capacity: 24 },
  { key: 'farzana', name: 'Farzana Akter', email: 'qa@teamflow.dev', role: 'TESTER', title: 'QA Engineer', color: '#ec4899', capacity: 22 },
  { key: 'imran', name: 'Imran Hossain', email: 'imran@teamflow.dev', role: 'TESTER', title: 'Automation Tester', color: '#22c55e', capacity: 22 },
];

export const SEED_PROJECTS: SeedProject[] = [
  {
    key: 'WEB', name: 'Customer Portal Revamp', color: '#6366f1', startOffset: -30, dueOffset: 25, owner: 'tanjina',
    description: 'Rebuild the self-service customer portal with a faster UI, SSO login and an accessible design system.',
    members: ['tanjina', 'arif', 'nusrat', 'farzana', 'rafiq'],
  },
  {
    key: 'MOB', name: 'Mobile Banking App', color: '#f59e0b', startOffset: -20, dueOffset: 40, owner: 'tanjina',
    description: 'React Native app for balance checks, bKash-style transfers and bill payments, with biometric login.',
    members: ['tanjina', 'samiul', 'nusrat', 'imran'],
  },
  {
    key: 'DATA', name: 'Data Pipeline Migration', color: '#14b8a6', startOffset: -45, dueOffset: 6, owner: 'rafiq',
    description: 'Move nightly ETL jobs from cron scripts to a monitored pipeline with alerting and data-quality checks.',
    members: ['rafiq', 'nusrat', 'imran', 'tanjina'],
  },
];

export const SEED_SPRINTS: SeedSprint[] = [
  { project: 'WEB', name: 'Sprint 3', goal: 'Design system + login', startOffset: -24, length: 14, status: 'COMPLETED' },
  { project: 'WEB', name: 'Sprint 4', goal: 'Dashboard and billing pages', startOffset: -8, length: 14, status: 'ACTIVE' },
  { project: 'WEB', name: 'Sprint 5', goal: 'Accessibility + performance', startOffset: 6, length: 14, status: 'PLANNED' },
  { project: 'MOB', name: 'Sprint 1', goal: 'Auth and account overview', startOffset: -6, length: 14, status: 'ACTIVE' },
  { project: 'DATA', name: 'Sprint 7', goal: 'Cut over the last 3 jobs', startOffset: -5, length: 10, status: 'ACTIVE' },
];

const T = (t: Partial<SeedTask> & Pick<SeedTask, 'project' | 'title'>): SeedTask => ({
  sprint: null, status: 'TODO', priority: 'MEDIUM', type: 'FEATURE', assignee: null, reporter: 'tanjina',
  points: 3, dueOffset: null, labels: [], createdOffset: -10, ...t,
});

export const SEED_TASKS: SeedTask[] = [
  // WEB · Sprint 3 (completed)
  T({ project: 'WEB', sprint: 'Sprint 3', title: 'Set up Tailwind design tokens', status: 'DONE', assignee: 'arif', points: 3, labels: ['design-system'], createdOffset: -24, doneOffset: -20 }),
  T({ project: 'WEB', sprint: 'Sprint 3', title: 'Build Button, Input and Modal components', status: 'DONE', assignee: 'arif', points: 5, labels: ['design-system'], createdOffset: -24, doneOffset: -15 }),
  T({ project: 'WEB', sprint: 'Sprint 3', title: 'SSO login with Google Workspace', status: 'DONE', assignee: 'nusrat', points: 8, priority: 'HIGH', labels: ['auth'], createdOffset: -23, doneOffset: -12 }),
  T({ project: 'WEB', sprint: 'Sprint 3', title: 'Regression test plan for login', status: 'DONE', type: 'CHORE', assignee: 'farzana', points: 2, labels: ['qa'], createdOffset: -22, doneOffset: -11 }),
  // WEB · Sprint 4 (active)
  T({ project: 'WEB', sprint: 'Sprint 4', title: 'Account dashboard layout', status: 'DONE', assignee: 'arif', points: 5, createdOffset: -8, doneOffset: -4, labels: ['dashboard'] }),
  T({ project: 'WEB', sprint: 'Sprint 4', title: 'Invoices API with pagination', status: 'DONE', assignee: 'nusrat', points: 5, createdOffset: -8, doneOffset: -3, labels: ['billing', 'api'] }),
  T({ project: 'WEB', sprint: 'Sprint 4', title: 'Billing page: invoice table + PDF download', status: 'REVIEW', assignee: 'arif', points: 8, priority: 'HIGH', dueOffset: 1, createdOffset: -7, labels: ['billing'],
    description: 'Show the last 24 invoices with filters by status. Each row has a PDF download. Use the paginated invoices API.' }),
  T({ project: 'WEB', sprint: 'Sprint 4', title: 'Payment method update flow', status: 'IN_PROGRESS', assignee: 'nusrat', points: 5, priority: 'HIGH', dueOffset: 3, createdOffset: -7, labels: ['billing'] }),
  T({ project: 'WEB', sprint: 'Sprint 4', title: 'Session expires too early on Safari', status: 'IN_PROGRESS', type: 'BUG', priority: 'URGENT', assignee: 'arif', points: 3, dueOffset: -1, createdOffset: -3, reporter: 'farzana', labels: ['auth', 'safari'] }),
  T({ project: 'WEB', sprint: 'Sprint 4', title: 'E2E tests for billing (Playwright)', status: 'TODO', type: 'CHORE', assignee: 'farzana', points: 3, dueOffset: 5, createdOffset: -6, labels: ['qa'] }),
  T({ project: 'WEB', sprint: 'Sprint 4', title: 'Usage chart on dashboard', status: 'TODO', assignee: 'arif', points: 3, dueOffset: 5, createdOffset: -5, labels: ['dashboard'] }),
  T({ project: 'WEB', sprint: 'Sprint 4', title: 'Notification preferences page', status: 'TODO', assignee: null, points: 2, dueOffset: 6, createdOffset: -5 }),
  // WEB · backlog / next sprint
  T({ project: 'WEB', sprint: 'Sprint 5', title: 'WCAG 2.2 audit fixes', status: 'TODO', assignee: 'farzana', points: 5, labels: ['a11y'], createdOffset: -4, dueOffset: 15 }),
  T({ project: 'WEB', sprint: 'Sprint 5', title: 'Lazy-load dashboard widgets', status: 'TODO', assignee: 'arif', points: 3, labels: ['performance'], createdOffset: -4, dueOffset: 16 }),
  T({ project: 'WEB', title: 'Dark mode for the portal', status: 'TODO', priority: 'LOW', points: 5, createdOffset: -12, labels: ['design-system'] }),
  T({ project: 'WEB', title: 'Export profile data (GDPR)', status: 'TODO', priority: 'MEDIUM', points: 3, createdOffset: -9 }),
  T({ project: 'WEB', sprint: 'Sprint 4', title: 'Stakeholder demo of the billing pages', status: 'TODO', type: 'CHORE', assignee: 'tanjina', points: 1, dueOffset: 4, createdOffset: -4, labels: ['demo'] }),
  T({ project: 'WEB', sprint: 'Sprint 5', title: 'Estimate and plan Sprint 5 with the team', status: 'IN_PROGRESS', type: 'CHORE', assignee: 'tanjina', points: 2, dueOffset: 2, createdOffset: -3, labels: ['planning'] }),
  // MOB · Sprint 1 (active)
  T({ project: 'MOB', sprint: 'Sprint 1', title: 'Biometric login (Face ID / fingerprint)', status: 'IN_PROGRESS', assignee: 'samiul', points: 8, priority: 'HIGH', dueOffset: 4, createdOffset: -6, labels: ['auth'] }),
  T({ project: 'MOB', sprint: 'Sprint 1', title: 'Accounts overview screen', status: 'REVIEW', assignee: 'samiul', points: 5, dueOffset: 2, createdOffset: -6 }),
  T({ project: 'MOB', sprint: 'Sprint 1', title: 'Balance API for mobile', status: 'DONE', assignee: 'nusrat', points: 3, createdOffset: -6, doneOffset: -2, labels: ['api'] }),
  T({ project: 'MOB', sprint: 'Sprint 1', title: 'OTP screen crashes on Android 12', status: 'TODO', type: 'BUG', priority: 'URGENT', assignee: 'samiul', points: 2, dueOffset: 1, createdOffset: -1, reporter: 'imran', labels: ['android'] }),
  T({ project: 'MOB', sprint: 'Sprint 1', title: 'Device farm test run', status: 'TODO', type: 'CHORE', assignee: 'imran', points: 3, dueOffset: 7, createdOffset: -5, labels: ['qa'] }),
  T({ project: 'MOB', title: 'Bill payment (electricity, gas, water)', status: 'TODO', points: 8, priority: 'HIGH', createdOffset: -10, labels: ['payments'] }),
  T({ project: 'MOB', title: 'Send money to contacts', status: 'TODO', points: 8, createdOffset: -10, labels: ['payments'] }),
  T({ project: 'MOB', title: 'Push notification service', status: 'TODO', points: 5, assignee: 'nusrat', createdOffset: -8 }),
  T({ project: 'MOB', sprint: 'Sprint 1', title: 'Write release notes for the beta', status: 'TODO', type: 'CHORE', assignee: 'tanjina', points: 1, dueOffset: 6, createdOffset: -2 }),
  // DATA · Sprint 7 (active)
  T({ project: 'DATA', sprint: 'Sprint 7', title: 'Migrate sales ETL to the pipeline', status: 'DONE', assignee: 'nusrat', points: 5, reporter: 'rafiq', createdOffset: -5, doneOffset: -1 }),
  T({ project: 'DATA', sprint: 'Sprint 7', title: 'Migrate inventory ETL', status: 'IN_PROGRESS', assignee: 'nusrat', points: 5, reporter: 'rafiq', dueOffset: 2, createdOffset: -5 }),
  T({ project: 'DATA', sprint: 'Sprint 7', title: 'Data-quality checks (row counts, nulls)', status: 'REVIEW', assignee: 'imran', points: 3, reporter: 'rafiq', dueOffset: 0, createdOffset: -5, labels: ['quality'] }),
  T({ project: 'DATA', sprint: 'Sprint 7', title: 'Slack alert when a job fails', status: 'TODO', assignee: 'nusrat', points: 2, reporter: 'rafiq', dueOffset: 4, createdOffset: -4, labels: ['alerting'] }),
  T({ project: 'DATA', sprint: 'Sprint 7', title: 'Decommission old cron server', status: 'TODO', type: 'CHORE', priority: 'LOW', assignee: 'rafiq', points: 1, reporter: 'rafiq', dueOffset: 6, createdOffset: -4 }),
  T({ project: 'DATA', title: 'Backfill 2024 sales history', status: 'TODO', points: 5, reporter: 'rafiq', createdOffset: -15 }),
];

export const SEED_COMMENTS: { task: string; author: string; body: string; offsetHours: number }[] = [
  { task: 'Billing page: invoice table + PDF download', author: 'arif', body: 'Ready for review. @Farzana the PDF button uses the new download endpoint.', offsetHours: -20 },
  { task: 'Billing page: invoice table + PDF download', author: 'farzana', body: 'Testing on Chrome and Safari now. Filters look good so far.', offsetHours: -6 },
  { task: 'Session expires too early on Safari', author: 'farzana', body: 'Reproduced: Safari drops the refresh cookie after 15 minutes because SameSite is missing.', offsetHours: -50 },
  { task: 'Session expires too early on Safari', author: 'arif', body: 'Found it, fixing the cookie flags now.', offsetHours: -30 },
  { task: 'OTP screen crashes on Android 12', author: 'imran', body: 'Crash log attached in the device farm report. Happens only when the SMS autofill prompt opens.', offsetHours: -10 },
  { task: 'Data-quality checks (row counts, nulls)', author: 'rafiq', body: 'Please make the thresholds configurable per table.', offsetHours: -14 },
];
