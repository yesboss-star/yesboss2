"use client";

import {
  Brain,
  Bot,
  FileSearch,
  LineChart,
  ShieldCheck,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "Multi-Agent AI System",
    description:
      "Finance, Operations, Workflow, and Forecasting agents work together to analyze your business from every angle.",
  },
  {
    icon: Bot,
    title: "Executive AI Chat",
    description:
      "Ask questions in plain English. Get data-backed answers with actionable recommendations instantly.",
  },
  {
    icon: FileSearch,
    title: "Intelligent Document Processing",
    description:
      "Upload PDFs, spreadsheets, and reports. AI extracts, analyzes, and stores insights automatically.",
  },
  {
    icon: LineChart,
    title: "Predictive Analytics",
    description:
      "AI forecasts revenue, identifies trends, and alerts you to opportunities and risks before they happen.",
  },
  {
    icon: Workflow,
    title: "Automated Workflows",
    description:
      "AI detects bottlenecks, suggests optimizations, and automates repetitive tasks across your organization.",
  },
  {
    icon: Users,
    title: "Role-Based Workspaces",
    description:
      "Dedicated dashboards for owners and employees. Each role gets AI tools tailored to their responsibilities.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise Security",
    description:
      "SOC 2 compliant, role-based access, encrypted data. Your business intelligence stays strictly confidential.",
  },
  {
    icon: Zap,
    title: "Real-Time Intelligence",
    description:
      "Continuous learning pipeline collects patterns, outcomes, and insights to improve AI accuracy over time.",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full glass-light text-sm text-primary mb-4">
            Features
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Everything You Need to{" "}
            <span className="gradient-text">Run Smarter</span>
          </h2>
          <p className="text-text-muted max-w-2xl mx-auto text-lg">
            A complete AI-powered operating system for your business.
            From intelligence gathering to execution—all in one platform.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, i) => (
            <div
              key={i}
              className="glass rounded-2xl p-6 card-hover cursor-default group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                {feature.title}
              </h3>
              <p className="text-text-muted text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
