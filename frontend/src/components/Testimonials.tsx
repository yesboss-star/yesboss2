"use client";

import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "CEO, TechNova Inc.",
    content: "YesBoss transformed how we operate. The AI agents caught a supply chain bottleneck we would have missed entirely—saving us $200K in a single quarter.",
    rating: 5,
  },
  {
    name: "Marcus Rodriguez",
    role: "COO, ScaleUp Labs",
    content: "The executive AI chat is like having a full-time analyst who never sleeps. I ask questions in plain English and get actionable answers with data backing.",
    rating: 5,
  },
  {
    name: "Priya Sharma",
    role: "Founder, GreenLeaf Analytics",
    content: "Onboarding was incredibly smooth. The AI understood our business from just a few documents and started giving relevant insights within hours.",
    rating: 5,
  },
  {
    name: "James Mitchell",
    role: "VP Operations, FinServe Global",
    content: "We reduced our weekly reporting time from 8 hours to 15 minutes. The AI dashboard surfaces exactly what we need before we even know we need it.",
    rating: 5,
  },
  {
    name: "Aisha Patel",
    role: "Director, HealthBridge",
    content: "The employee onboarding flow is brilliant. New hires are productive in days instead of weeks. The AI persona matching is surprisingly accurate.",
    rating: 5,
  },
  {
    name: "David Kim",
    role: "CTO, DataPulse",
    content: "Multi-agent AI architecture is the real deal. Finance, operations, and forecasting agents work together to give us a 360-degree view of the business.",
    rating: 5,
  },
];

export default function Testimonials() {
  return (
    <section className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full glass-light text-sm text-primary mb-4">
            Testimonials
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Trusted by <span className="gradient-text">Industry Leaders</span>
          </h2>
          <p className="text-text-muted max-w-2xl mx-auto text-lg">
            See how businesses are transforming their operations with AI-powered intelligence.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="glass rounded-2xl p-6 card-hover cursor-default"
            >
              <Quote className="w-8 h-8 text-primary/30 mb-4" />
              <div className="flex gap-1 mb-4">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 text-accent fill-accent" />
                ))}
              </div>
              <p className="text-text-muted text-sm leading-relaxed mb-6">
                &ldquo;{t.content}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
                  <span className="text-white text-sm font-semibold">
                    {t.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-text-muted">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
