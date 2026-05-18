"use client";

import {
  TrendingUp,
  Users,
  DollarSign,
  Activity,
  Target,
  Brain,
} from "lucide-react";

const insights = [
  {
    icon: TrendingUp,
    title: "Revenue Forecast",
    description: "AI predicts 23% revenue growth next quarter based on pipeline analysis and market trends.",
    metric: "+23%",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  {
    icon: Users,
    title: "Team Productivity",
    description: "Workflow bottlenecks detected in design team. AI suggests reallocating 2 resources to unblock sprint.",
    metric: "3 blockers",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  {
    icon: DollarSign,
    title: "Cost Optimization",
    description: "Identified $12.4K monthly savings by optimizing vendor contracts and reducing redundant subscriptions.",
    metric: "$12.4K",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    icon: Activity,
    title: "Operations Health",
    description: "All systems operational. Customer satisfaction at 94%—5% above industry benchmark for your sector.",
    metric: "94%",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
  },
  {
    icon: Target,
    title: "Goal Progress",
    description: "Q2 objectives 68% complete. AI recommends prioritizing customer onboarding to hit 80% by month-end.",
    metric: "68%",
    color: "text-rose-400",
    bg: "bg-rose-400/10",
  },
  {
    icon: Brain,
    title: "Market Intelligence",
    description: "Competitor analysis shows 2 new entrants in your space. AI suggests differentiating on service speed.",
    metric: "2 new",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
  },
];

export default function AIInsights() {
  return (
    <section id="insights" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full glass-light text-sm text-primary mb-4">
            AI Intelligence
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Insights That <span className="gradient-text">Drive Growth</span>
          </h2>
          <p className="text-text-muted max-w-2xl mx-auto text-lg">
            Multi-agent AI system continuously analyzes your business data to surface
            actionable insights before you even ask.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {insights.map((insight, i) => (
            <div
              key={i}
              className="glass rounded-2xl p-6 card-hover cursor-default group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl ${insight.bg} flex items-center justify-center`}>
                  <insight.icon className={`w-6 h-6 ${insight.color}`} />
                </div>
                <span className={`text-2xl font-bold ${insight.color}`}>
                  {insight.metric}
                </span>
              </div>
              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                {insight.title}
              </h3>
              <p className="text-text-muted text-sm leading-relaxed">
                {insight.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
