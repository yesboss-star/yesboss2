"use client";

import { useState } from "react";
import {
  BarChart3,
  PieChart,
  LineChart,
  LayoutDashboard,
  MessageSquare,
  Workflow,
} from "lucide-react";

const tabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "finance", label: "Finance", icon: PieChart },
  { id: "trends", label: "Trends", icon: LineChart },
  { id: "ai-chat", label: "AI Chat", icon: MessageSquare },
  { id: "workflows", label: "Workflows", icon: Workflow },
];

const dashboardViews: Record<string, React.ReactNode> = {
  overview: (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[
        { label: "Revenue", value: "$284K", change: "+12.5%", up: true },
        { label: "Customers", value: "1,847", change: "+8.2%", up: true },
        { label: "Tasks Done", value: "3,421", change: "+24.1%", up: true },
        { label: "Efficiency", value: "94.2%", change: "+3.1%", up: true },
      ].map((stat, i) => (
        <div key={i} className="glass-light rounded-xl p-4">
          <div className="text-sm text-text-muted">{stat.label}</div>
          <div className="text-2xl font-bold mt-1">{stat.value}</div>
          <div className={`text-xs mt-1 ${stat.up ? "text-emerald-400" : "text-rose-400"}`}>
            {stat.change}
          </div>
        </div>
      ))}
      <div className="col-span-2 md:col-span-4 glass-light rounded-xl p-6 mt-2">
        <div className="flex items-end gap-2 h-32">
          {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-gradient-to-t from-primary/60 to-primary rounded-t-sm transition-all hover:from-primary hover:to-primary-light"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-text-muted">
          <span>Jan</span><span>Dec</span>
        </div>
      </div>
    </div>
  ),
  analytics: (
    <div className="space-y-4">
      <div className="glass-light rounded-xl p-6">
        <h4 className="text-sm text-text-muted mb-4">Performance Metrics</h4>
        <div className="space-y-3">
          {[
            { label: "Task Completion", value: 92 },
            { label: "Response Time", value: 87 },
            { label: "Customer Satisfaction", value: 94 },
            { label: "Resource Utilization", value: 78 },
          ].map((m, i) => (
            <div key={i}>
              <div className="flex justify-between text-sm mb-1">
                <span>{m.label}</span>
                <span className="text-primary">{m.value}%</span>
              </div>
              <div className="h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-1000"
                  style={{ width: `${m.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
  finance: (
    <div className="grid grid-cols-2 gap-4">
      {[
        { label: "Monthly Revenue", value: "$47.2K", sub: "vs $41.8K last month" },
        { label: "Operating Costs", value: "$18.6K", sub: "12% below budget" },
        { label: "Profit Margin", value: "60.6%", sub: "+4.2% improvement" },
        { label: "Cash Flow", value: "+$28.6K", sub: "Healthy trajectory" },
      ].map((item, i) => (
        <div key={i} className="glass-light rounded-xl p-5">
          <div className="text-sm text-text-muted">{item.label}</div>
          <div className="text-2xl font-bold mt-1 text-primary">{item.value}</div>
          <div className="text-xs text-text-muted mt-1">{item.sub}</div>
        </div>
      ))}
    </div>
  ),
  trends: (
    <div className="glass-light rounded-xl p-6">
      <h4 className="text-sm text-text-muted mb-4">12-Month Growth Trend</h4>
      <div className="relative h-40">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 160">
          <defs>
            <linearGradient id="trendGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,140 L33,120 L66,110 L100,95 L133,85 L166,70 L200,60 L233,50 L266,40 L300,25 L333,20 L366,15 L400,10 L400,160 L0,160 Z"
            fill="url(#trendGrad)"
          />
          <path
            d="M0,140 L33,120 L66,110 L100,95 L133,85 L166,70 L200,60 L233,50 L266,40 L300,25 L333,20 L366,15 L400,10"
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  ),
  "ai-chat": (
    <div className="glass-light rounded-xl p-6 space-y-4">
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <span className="text-xs text-primary font-bold">U</span>
        </div>
        <div className="glass rounded-lg px-4 py-2 text-sm max-w-md">
          What should I prioritize this week to hit our Q2 targets?
        </div>
      </div>
      <div className="flex gap-3 justify-end">
        <div className="bg-primary/20 rounded-lg px-4 py-2 text-sm max-w-md">
          Based on current trajectory, focus on: (1) Closing 3 pending deals worth $45K,
          (2) Reducing support ticket resolution time by 15%, (3) Launching the new onboarding flow.
        </div>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0">
          <span className="text-xs text-white font-bold">AI</span>
        </div>
      </div>
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <span className="text-xs text-primary font-bold">U</span>
        </div>
        <div className="glass rounded-lg px-4 py-2 text-sm max-w-md">
          Show me the bottleneck analysis for our operations.
        </div>
      </div>
    </div>
  ),
  workflows: (
    <div className="space-y-3">
      {[
        { name: "Client Onboarding", status: "Active", tasks: 12, progress: 75 },
        { name: "Monthly Reporting", status: "Pending Review", tasks: 5, progress: 90 },
        { name: "Product Launch", status: "In Progress", tasks: 28, progress: 45 },
        { name: "Hiring Pipeline", status: "Active", tasks: 8, progress: 60 },
      ].map((wf, i) => (
        <div key={i} className="glass-light rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Workflow className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">{wf.name}</div>
            <div className="text-xs text-text-muted">{wf.tasks} tasks · {wf.status}</div>
          </div>
          <div className="w-24">
            <div className="h-1.5 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${wf.progress}%` }}
              />
            </div>
          </div>
          <span className="text-sm text-primary font-medium w-10 text-right">{wf.progress}%</span>
        </div>
      ))}
    </div>
  ),
};

export default function DashboardPreview() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <section id="dashboard" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full glass-light text-sm text-primary mb-4">
            Dashboard Preview
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Command Center for <span className="gradient-text">Your Business</span>
          </h2>
          <p className="text-text-muted max-w-2xl mx-auto text-lg">
            Real-time visibility into every aspect of your organization.
            Switch between views to see the full power of YesBoss.
          </p>
        </div>

        <div className="glass rounded-2xl overflow-hidden shadow-2xl shadow-primary/5">
          <div className="border-b border-border px-4 md:px-6">
            <div className="flex overflow-x-auto scrollbar-hide -mb-px">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-text-muted hover:text-foreground"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 md:p-6 min-h-[400px]">
            {dashboardViews[activeTab]}
          </div>
        </div>
      </div>
    </section>
  );
}
