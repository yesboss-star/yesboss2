"use client";

import { Flag, PieChart as PieChartIcon, TrendingUp } from "lucide-react";

export function ChartHeading({ icon: Icon, title, note }: { icon: React.ElementType; title: string; note: string }) {
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <p className="-mt-1 mb-3 text-sm text-text-muted">{note}</p>
    </>
  );
}

/** A ring split by status, with the total in the middle. Hovering a part names it. */
export function StatusDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const starts = data.map((_, i) => data.slice(0, i).reduce((sum, d) => sum + (d.value / total) * circumference, 0));
  return (
    <svg viewBox="0 0 160 160" width="150" height="150" role="img" aria-label={`Task distribution by status: ${data.map((d) => `${d.value} ${d.name}`).join(", ")}`}>
      {data.map((d, i) => {
        const length = (d.value / total) * circumference;
        return (
          <circle
            key={d.name}
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={d.color}
            strokeWidth="22"
            strokeDasharray={`${length.toFixed(2)} ${(circumference - length).toFixed(2)}`}
            strokeDashoffset={(-starts[i]).toFixed(2)}
            transform="rotate(-90 80 80)"
          >
            <title>{`${d.name}: ${d.value}`}</title>
          </circle>
        );
      })}
      <text x="80" y="80" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--foreground)">{total}</text>
      <text x="80" y="99" textAnchor="middle" fontSize="11" fill="var(--text-muted)">tasks</text>
    </svg>
  );
}

/** Pending, in progress and completed as one line with its area filled and each count written on its point. */
export function CompletionLine({ points }: { points: { name: string; value: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const xs = [20, 150, 280];
  const ys = points.map((p) => 90 - (p.value / max) * 80);
  const line = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  return (
    <svg viewBox="0 0 300 124" width="100%" style={{ maxWidth: 420 }} role="img" aria-label={`Completed against total tasks: ${points.map((p) => `${p.value} ${p.name}`).join(", ")}`}>
      <polygon points={`${xs[0]},90 ${line} ${xs[2]},90`} fill="#0ea5e9" opacity=".2" />
      <polyline points={line} fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.name}>
          <circle cx={xs[i]} cy={ys[i]} r="4.5" fill="#0ea5e9" stroke="var(--outline)" strokeWidth="1.5">
            <title>{`${p.name}: ${p.value}`}</title>
          </circle>
          <text x={xs[i]} y={ys[i] - 9} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--foreground)">{p.value}</text>
          <text x={xs[i]} y="107" textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">{p.name}</text>
        </g>
      ))}
    </svg>
  );
}

type ChartTask = { status?: string };
type ChartGoal = { id?: string; title?: string; progress?: number };

/** The three task charts, from the tasks and goals handed in (so each caller decides whose they are). */
export function statusCounts(tasks: ChartTask[]) {
  return [
    { name: "Completed", value: tasks.filter((t) => t.status === "completed" || t.status === "approved").length, color: "#10b981" },
    { name: "In Progress", value: tasks.filter((t) => t.status === "in_progress").length, color: "#0ea5e9" },
    { name: "Pending", value: tasks.filter((t) => t.status === "pending").length, color: "#eab308" },
  ];
}

export function GoalBars({ goals }: { goals: ChartGoal[] }) {
  return (
    <div className="space-y-3">
      {goals.slice(0, 8).map((g, i) => {
        const progress = Math.min(100, Math.max(0, g.progress ?? 0));
        const title = g.title || "Goal";
        return (
          <div key={g.id || i} title={`${title}: ${progress}%`}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{title.length > 28 ? `${title.slice(0, 28)}...` : title}</span>
              <b>{progress}%</b>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full border border-border/60 bg-background">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One chart as a card in the chat: Task distribution, Goal progress or Task completion. */
export function InsightChartCard({ kind, tasks, goals, own }: { kind: "distribution" | "goals" | "completion"; tasks: ChartTask[]; goals: ChartGoal[]; own: boolean }) {
  const whose = own ? "your" : "all";
  const counts = statusCounts(tasks);
  const shown = counts.filter((d) => d.value > 0);
  const empty = (what: string) => <p className="text-sm text-text-muted">No {what} yet.</p>;
  return (
    <div className="glass rounded-3xl p-5">
      {kind === "distribution" && (
        <>
          <ChartHeading icon={PieChartIcon} title="Task distribution" note={`Real-time breakdown of ${whose} task statuses`} />
          {shown.length === 0 ? empty("tasks") : (
            <div className="flex flex-wrap items-center justify-center gap-5">
              <StatusDonut data={shown} />
              <ul className="space-y-1.5 text-sm">
                {shown.map((d) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <i className="h-3 w-3 rounded border border-outline" style={{ background: d.color }} />
                    {d.name}
                    <b>{d.value}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {kind === "goals" && (
        <>
          <ChartHeading icon={Flag} title="Goal progress" note={own ? "Progress on each of your goals" : "Completion percentage per goal"} />
          {goals.length === 0 ? empty("goals") : <GoalBars goals={goals} />}
        </>
      )}
      {kind === "completion" && (
        <>
          <ChartHeading icon={TrendingUp} title="Task completion" note={`Completed vs total, from ${whose} tasks`} />
          {shown.length === 0 ? empty("tasks") : (
            <CompletionLine points={[
              { name: "Pending", value: counts[2].value },
              { name: "In Progress", value: counts[1].value },
              { name: "Complete", value: counts[0].value },
            ]} />
          )}
        </>
      )}
    </div>
  );
}
