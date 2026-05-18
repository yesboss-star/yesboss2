"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

export default function CTASection() {
  return (
    <section className="py-24 relative">
      <div className="max-w-4xl mx-auto px-6">
        <div className="relative glass rounded-3xl p-12 md:p-16 text-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10" />
          <div className="hero-glow top-0 left-1/2 -translate-x-1/2 animate-pulse-glow" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-light mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-text-muted">
                Start Free — No Credit Card Required
              </span>
            </div>

            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Ready to Transform Your{" "}
              <span className="gradient-text">Business?</span>
            </h2>

            <p className="text-text-muted text-lg max-w-xl mx-auto mb-8">
              Join hundreds of companies using AI to make smarter decisions,
              automate workflows, and accelerate growth.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-xl hover:shadow-accent/30 hover:-translate-y-0.5"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer"
              >
                Learn More
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
