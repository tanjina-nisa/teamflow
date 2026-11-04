import { BarChart3, Bell, KanbanSquare, Shield, Users, Zap } from 'lucide-react';

export function AuthSide() {
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#4f46e5] via-[#6457f9] to-[#8b5cf6] p-10 text-white lg:flex lg:flex-col">
      <div className="flex items-center gap-2.5">
        <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl ring-2 ring-white/30" />
        <span className="text-lg font-bold">TeamFlow</span>
      </div>
      <div className="my-auto max-w-md">
        <h1 className="text-4xl leading-tight font-bold">Plan sprints, ship faster, keep the whole team in sync.</h1>
        <p className="mt-4 text-white/80">Projects, Kanban boards, deadlines, workload and reports for software teams, with live updates for everyone.</p>
        <ul className="mt-8 space-y-3 text-sm">
          {[
            [KanbanSquare, 'Kanban boards with drag & drop and a QA gate'],
            [Zap, 'Sprint planning, burndown and velocity'],
            [Users, 'Team workload vs. capacity'],
            [Bell, 'Deadline reminders and @mentions'],
            [BarChart3, 'Daily / weekly reports, CSV & PDF export'],
            [Shield, 'Admin, Project Manager, Developer and Tester roles'],
          ].map(([Icon, text], i) => {
            const I = Icon as typeof Zap;
            return (
              <li key={i} className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15"><I size={16} /></span>
                {text as string}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="pointer-events-none absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
    </div>
  );
}

