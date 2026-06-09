"use client";

import { useState, useEffect } from "react";
import { Menu, X, ChevronRight } from "lucide-react";
import Link from "next/link";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-4 left-4 right-4 z-50 transition-all duration-300 ${
        scrolled
          ? "glass rounded-2xl shadow-lg shadow-primary/5"
          : "bg-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 cursor-pointer">
          <img src="/yesboss-logo.svg" alt="YesBoss" className="w-9 h-9" />
          <span className="text-xl font-bold tracking-tight">
            Yes<span className="text-primary">Boss</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer">
            Features
          </a>
          <a href="#insights" className="text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer">
            AI Insights
          </a>
          <a href="#dashboard" className="text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer">
            Dashboard
          </a>
          <a href="#integrations" className="text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer">
            Integrations
          </a>
          <a href="#faq" className="text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer">
            FAQ
          </a>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25"
          >
            Start Free
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <button
          className="md:hidden text-foreground cursor-pointer"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="md:hidden glass rounded-2xl mx-4 mb-4 p-6">
          <div className="flex flex-col gap-4">
            <a href="#features" className="text-text-muted hover:text-foreground transition-colors py-2">Features</a>
            <a href="#insights" className="text-text-muted hover:text-foreground transition-colors py-2">AI Insights</a>
            <a href="#dashboard" className="text-text-muted hover:text-foreground transition-colors py-2">Dashboard</a>
            <a href="#integrations" className="text-text-muted hover:text-foreground transition-colors py-2">Integrations</a>
            <a href="#faq" className="text-text-muted hover:text-foreground transition-colors py-2">FAQ</a>
            <div className="border-t border-border pt-4 flex flex-col gap-3">
              <Link href="/login" className="text-text-muted hover:text-foreground transition-colors py-2">Log in</Link>
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all">
                Start Free
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
