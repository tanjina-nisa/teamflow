# TeamFlow — Smart Project & Team Management (SaaS)

**Live demo:** https://teamflow-saas.vercel.app  
One-click login as **Admin, Project Manager, Developer or Tester** (password `teamflow123`).

TeamFlow lets a company manage its employees, projects, sprints, tasks, deadlines and team performance in one place. It is built like a real multi-tenant SaaS product: a Next.js frontend, a NestJS + PostgreSQL API with JWT auth and role guards, Socket.IO for live updates, Docker, and CI on GitHub Actions.

> The Vercel deployment runs in **demo mode**: the same API is simulated in the browser (localStorage), so anyone can try every feature without a server. Open two tabs, switch one to another demo user, and you will see cards move live. Point `NEXT_PUBLIC_API_URL` at the NestJS API to use the real backend.

## ✨ Features

| Area | What you get |
| --- | --- |
| **Roles** | Admin, Project Manager, Developer, Tester, enforced by NestJS guards (and mirrored in the UI) |
| **Projects** | Create projects with a key (WEB-42 style task IDs), colour, dates, status and team members |
| **Kanban board** | To Do → In Progress → Review → Done, drag & drop with ordering, filters by sprint / person / type / text |
| **QA gate** | Only testers, PMs and admins can move a task to *Done*; testers are notified when work reaches *Review* |
| **Sprints** | Plan, start and complete sprints (only one active per project). Unfinished work goes back to the backlog. Burndown chart and velocity |
| **Tasks** | Priority, type (feature/bug/chore), story points, due date, labels, description, assignee rules |
| **Comments & files** | Comments with `@mentions`, file attachments (multer → disk; swap for S3) |
| **Notifications** | Assigned, mentioned, ready for review, done, project invites, and **deadline reminders** (hourly cron: due within 24h or overdue) |
| **Workload analytics** | Open story points vs. capacity per person, with Available / Busy / Overloaded status |
| **Reports** | Daily and weekly progress: completed, created, overdue, per member, per project. Copy as text for Slack, CSV export, print to PDF |
| **Activity log** | Audit trail of every change, filter by project / type / person, CSV export |
| **Real-time** | Socket.IO rooms per workspace and per user; presence dots |
| **UX** | Fast client-side app, optimistic updates, dark mode, global search (`/`), mobile layout |

## 🏗️ Architecture

```
apps/
  web/   Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Zustand
         lib/backend/http.ts   → REST + socket.io-client (real API)
         lib/backend/demo.ts   → same interface in the browser (demo mode)
  api/   NestJS 12 · TypeORM · PostgreSQL · JWT · Socket.IO · @nestjs/schedule · multer
         src/entities          → Workspace, User, Project, Sprint, Task, Comment, Attachment, Activity, Notification
         src/common/auth.ts    → global JWT guard + @Roles()
         src/tasks/tasks.ts    → business rules (QA gate, assignment rules, atomic WEB-42 numbering)
         src/realtime          → Socket.IO gateway (JWT handshake, rooms)
         test/e2e.test.mjs     → end-to-end tests (auth, RBAC, QA gate, sockets, files, sprints, reports)
docker-compose.yml             → Postgres + API + web
.github/workflows/ci.yml       → API e2e tests against Postgres, web typecheck + build, Docker build
render.yaml                    → one-click Render blueprint (API + Postgres)
```

### API overview

| Method | Path | Who |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login` · GET `/auth/me` | public / any |
| GET | `/workspace/bootstrap` | any (returns what the user may see) |
| GET/POST/PATCH | `/users` | list: any · create/update: **Admin** |
| GET/POST/PATCH/DELETE | `/projects` | read: members · write: **PM** · delete: **Admin** |
| GET/POST | `/projects/:id/sprints` · POST `/sprints/:id/start`, `/sprints/:id/complete` | write: **PM** |
| GET/POST/PATCH/DELETE | `/tasks` | members · delete: **PM** · Done: **Tester/PM** |
| GET/POST | `/tasks/:id/comments`, `/tasks/:id/attachments` | members |
| GET | `/activity`, `/notifications`, `/reports/progress?range=daily|weekly`, `/reports/workload` (**PM**), `/reports/export.csv` | |

Socket.IO events: `task.upserted`, `task.deleted`, `project.upserted`, `sprint.upserted`, `comment.created`, `attachment.created`, `activity.created`, `notification.created`, `presence`.

## ▶️ Run it locally

**Everything with Docker**

```bash
docker compose up --build
# web http://localhost:3000 · api http://localhost:4000 · demo users are seeded automatically
```

**Without Docker**

```bash
# 1) API (needs PostgreSQL)
cd apps/api
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm install && npm run build
npm run seed                   # demo workspace: admin@ / pm@ / dev@ / qa@teamflow.dev · teamflow123
npm start                      # http://localhost:4000
API_URL=http://localhost:4000 npm test   # e2e tests

# 2) Web
cd ../web
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > .env.local   # leave empty for demo mode
npm install && npm run dev     # http://localhost:3000
```

## 🚀 Deploy

- **Web → Vercel**: import the repo, set *Root Directory* to `apps/web`. Add `NEXT_PUBLIC_API_URL` only when the API is live.
- **API + Postgres → Render**: *New → Blueprint* and pick this repo (`render.yaml`). Or use any Docker host (AWS ECS / Fly / Railway) with Neon or RDS Postgres. Set `CORS_ORIGIN` to the Vercel URL and `DATABASE_SSL=true` for managed Postgres.

## 🔐 Security notes

- Passwords hashed with bcrypt; JWT signed with `JWT_SECRET` (required in production).
- Every query is scoped to the user's workspace; developers and testers only see projects they belong to.
- DTO validation with `class-validator` (`whitelist` + `forbidNonWhitelisted`).
- `DB_SYNC=true` auto-creates tables for an easy start. Switch to migrations for real data.

---

Built by **Tanjina Akter Nisa**, CSE, University of Asia Pacific, drawing on her Project Manager internship experience.
