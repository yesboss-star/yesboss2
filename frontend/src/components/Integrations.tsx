"use client";

import {
  Database,
  Cloud,
  Mail,
  Calendar,
  MessageCircle,
  FileText,
  Globe,
  Shield,
} from "lucide-react";

const integrations = [
  { icon: Database, name: "MongoDB", category: "Database" },
  { icon: Cloud, name: "Supabase", category: "Backend" },
  { icon: Mail, name: "Gmail", category: "Communication" },
  { icon: Calendar, name: "Google Calendar", category: "Productivity" },
  { icon: MessageCircle, name: "Slack", category: "Communication" },
  { icon: FileText, name: "Google Drive", category: "Storage" },
  { icon: Globe, name: "Firecrawl", category: "Web Scraping" },
  { icon: Shield, name: "Okta", category: "Security" },
];

export default function Integrations() {
  return (
    <section id="integrations" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full glass-light text-sm text-primary mb-4">
            Integrations
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Connects With <span className="gradient-text">Your Stack</span>
          </h2>
          <p className="text-text-muted max-w-2xl mx-auto text-lg">
            Seamlessly integrates with the tools you already use.
            More integrations added every week.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {integrations.map((integration, i) => (
            <div
              key={i}
              className="glass rounded-2xl p-6 card-hover cursor-default group text-center"
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <integration.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">{integration.name}</h3>
              <p className="text-sm text-text-muted">{integration.category}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-text-muted text-sm">
            + 50 more integrations coming soon
          </p>
        </div>
      </div>
    </section>
  );
}
