"use client";

import { ArrowRight, X, Link as LinkIcon } from "lucide-react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <img src="/yesboss-logo.svg" alt="YesBoss" className="w-9 h-9" />
              <span className="text-xl font-bold tracking-tight">
                Yes<span className="text-primary">Boss</span>
              </span>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">
              AI Business Operating System that transforms your data into
              actionable intelligence.
            </p>
            <div className="flex gap-3 mt-6">
              <a href="#" className="w-9 h-9 rounded-lg glass-light flex items-center justify-center text-text-muted hover:text-foreground transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </a>
              <a href="#" className="w-9 h-9 rounded-lg glass-light flex items-center justify-center text-text-muted hover:text-foreground transition-colors cursor-pointer">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
              <a href="#" className="w-9 h-9 rounded-lg glass-light flex items-center justify-center text-text-muted hover:text-foreground transition-colors cursor-pointer">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 2.614 1.026 1.498-.434 3.094-.672 4.691-.672 1.597 0 3.194.238 4.691.672 1.606-1.348 2.614-1.026 2.614-1.026.652 1.652.241 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-3 text-sm text-text-muted">
              <li><a href="#features" className="hover:text-foreground transition-colors cursor-pointer">Features</a></li>
              <li><a href="#dashboard" className="hover:text-foreground transition-colors cursor-pointer">Dashboard</a></li>
              <li><a href="#integrations" className="hover:text-foreground transition-colors cursor-pointer">Integrations</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors cursor-pointer">Pricing</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors cursor-pointer">Changelog</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-3 text-sm text-text-muted">
              <li><a href="#" className="hover:text-foreground transition-colors cursor-pointer">About</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors cursor-pointer">Blog</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors cursor-pointer">Careers</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors cursor-pointer">Contact</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Stay Updated</h4>
            <p className="text-sm text-text-muted mb-4">
              Get the latest AI insights and product updates.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-2.5 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:border-primary transition-colors"
                suppressHydrationWarning
              />
              <button className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors cursor-pointer">
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-text-muted">
            &copy; 2026 YesBoss. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-text-muted">
            <a href="#" className="hover:text-foreground transition-colors cursor-pointer">Privacy Policy</a>
            <a href="#" className="hover:text-foreground transition-colors cursor-pointer">Terms of Service</a>
            <a href="#" className="hover:text-foreground transition-colors cursor-pointer">Cookie Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
