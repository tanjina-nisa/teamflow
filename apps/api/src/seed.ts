/**
 * Seeds a demo workspace (Nexora Labs) with 7 users, 3 projects, 5 sprints and ~30 tasks.
 * Usage: npm run build && npm run seed      (add --reset to wipe the demo workspace first)
 * Every demo account uses the password in DEMO_PASSWORD.
 */
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { Activity, Comment, ENTITIES, Notification, Project, Sprint, Task, User, Workspace } from './entities';
import { DEMO_PASSWORD, SEED_COMMENTS, SEED_PROJECTS, SEED_SPRINTS, SEED_TASKS, SEED_USERS, SEED_WORKSPACE } from './seed-data';

const DAY = 86400000;
const day = (offset: number) => new Date(Date.now() + offset * DAY);
const date = (offset: number) => day(offset).toISOString().slice(0, 10);

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/teamflow',
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities: ENTITIES,
    synchronize: true,
  });
  await ds.initialize();

  const existing = await ds.getRepository(Workspace).findOneBy({ slug: SEED_WORKSPACE.slug });
  if (existing) {
    if (!process.argv.includes('--reset')) {
      console.log('Demo workspace already exists. Run with --reset to recreate it.');
      await ds.destroy();
      return;
    }
    await ds.getRepository(Activity).delete({ workspaceId: existing.id });
    const ids = (await ds.getRepository(User).findBy({ workspaceId: existing.id })).map((u) => u.id);
    if (ids.length) await ds.createQueryBuilder().delete().from(Notification).where('userId IN (:...ids)', { ids }).execute();
    await ds.getRepository(Project).delete({ workspaceId: existing.id });
    await ds.getRepository(Workspace).delete({ id: existing.id });
  }

  await ds.transaction(async (m) => {
    const ws = await m.save(m.create(Workspace, SEED_WORKSPACE));
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const users = new Map<string, User>();
    for (const u of SEED_USERS) {
      const { key, ...rest } = u;
      users.set(key, await m.save(m.create(User, { ...rest, workspaceId: ws.id, passwordHash: hash })));
    }
    const id = (k: string | null) => (k ? users.get(k)!.id : null);

    const projects = new Map<string, Project>();
    for (const p of SEED_PROJECTS) {
      const count = SEED_TASKS.filter((t) => t.project === p.key).length;
      projects.set(
        p.key,
        await m.save(
          m.create(Project, {
            workspaceId: ws.id, key: p.key, name: p.name, description: p.description, color: p.color,
            startDate: date(p.startOffset), dueDate: date(p.dueOffset), ownerId: id(p.owner), taskSeq: count,
            members: p.members.map((k) => users.get(k)!),
          }),
        ),
      );
    }

    const sprints = new Map<string, Sprint>();
    for (const s of SEED_SPRINTS) {
      sprints.set(
        `${s.project}/${s.name}`,
        await m.save(m.create(Sprint, { projectId: projects.get(s.project)!.id, name: s.name, goal: s.goal, startDate: date(s.startOffset), endDate: date(s.startOffset + s.length), status: s.status })),
      );
    }

    const seq = new Map<string, number>();
    const tasks = new Map<string, Task>();
    for (const [i, t] of SEED_TASKS.entries()) {
      const n = (seq.get(t.project) ?? 0) + 1;
      seq.set(t.project, n);
      const p = projects.get(t.project)!;
      const row = await m.save(
        m.create(Task, {
          workspaceId: ws.id, projectId: p.id, sprintId: t.sprint ? sprints.get(`${t.project}/${t.sprint}`)!.id : null,
          number: n, title: t.title, description: t.description ?? '', status: t.status, priority: t.priority, type: t.type,
          assigneeId: id(t.assignee), reporterId: id(t.reporter), points: t.points,
          dueDate: t.dueOffset === null ? null : date(t.dueOffset), labels: t.labels, order: (i + 1) * 1000,
          completedAt: t.status === 'DONE' ? day(t.doneOffset ?? -1) : null,
          createdAt: day(t.createdOffset),
        }),
      );
      tasks.set(t.title, row);
      await m.save(m.create(Activity, { workspaceId: ws.id, projectId: p.id, taskId: row.id, actorId: id(t.reporter), action: 'task.created', message: `created ${p.key}-${n} “${t.title}”`, createdAt: day(t.createdOffset) }));
      if (t.status === 'DONE') {
        await m.save(m.create(Activity, { workspaceId: ws.id, projectId: p.id, taskId: row.id, actorId: id(t.assignee), action: 'task.moved', message: `moved ${p.key}-${n} from Review to Done`, meta: { from: 'REVIEW', to: 'DONE' }, createdAt: day(t.doneOffset ?? -1) }));
      }
    }

    for (const c of SEED_COMMENTS) {
      const t = tasks.get(c.task)!;
      await m.save(m.create(Comment, { taskId: t.id, authorId: id(c.author)!, body: c.body, createdAt: new Date(Date.now() + c.offsetHours * 3600000) }));
    }

    const pm = users.get('tanjina')!;
    await m.save([
      m.create(Notification, { userId: pm.id, type: 'review', title: 'WEB-7 is ready for review', body: 'Billing page: invoice table + PDF download', link: `/projects/${projects.get('WEB')!.id}` }),
      m.create(Notification, { userId: pm.id, type: 'deadline', title: 'Overdue: WEB-9', body: 'Session expires too early on Safari', link: `/projects/${projects.get('WEB')!.id}` }),
    ]);
  });

  console.log(`Seeded "${SEED_WORKSPACE.name}". Log in with admin@teamflow.dev / pm@teamflow.dev / dev@teamflow.dev / qa@teamflow.dev, password: ${DEMO_PASSWORD}`);
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
