"use client";

import { ArrowRight, Sparkles, Zap, Shield } from "lucide-react";
import Link from "next/link";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      <div className="hero-glow top-1/4 left-1/4 animate-pulse-glow" />
      <div className="hero-glow bottom-1/4 right-1/4 animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-light mb-8 animate-float">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm text-text-muted">
            Powered by Multi-Agent AI System
          </span>
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.1] mb-6">
          Your AI Business
          <br />
          <span className="gradient-text">Operating System</span>
        </h1>

        <p className="max-w-2xl mx-auto text-lg md:text-xl text-text-muted mb-10 leading-relaxed">
          YesBoss transforms your raw business data into actionable intelligence.
          AI agents analyze, predict, and automate—so you make smarter decisions faster.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link
            href="/signup"
            className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-xl hover:shadow-accent/30 hover:-translate-y-0.5"
          >
            Start Free Trial
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a
            href="#dashboard"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer"
          >
            See Dashboard
          </a>
        </div>

        <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto">
          <div className="text-center">
            <div className="text-3xl md:text-4xl font-bold text-primary">6x</div>
            <div className="text-sm text-text-muted mt-1">Faster Decisions</div>
          </div>
          <div className="text-center">
            <div className="text-3xl md:text-4xl font-bold text-primary">85%</div>
            <div className="text-sm text-text-muted mt-1">Time Saved</div>
          </div>
          <div className="text-center">
            <div className="text-3xl md:text-4xl font-bold text-primary">24/7</div>
            <div className="text-sm text-text-muted mt-1">AI Monitoring</div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
