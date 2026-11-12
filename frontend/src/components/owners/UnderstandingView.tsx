"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Download, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useOrganizationStore } from "@/stores/organizationStore";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

interface Profile {
  markdown: string;
  provider: "ai" | "facts";
  generated_at: string | null;
}

/** **bold** and _italic_ as elements. Everything else stays plain text, so nothing in the document can inject markup. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** The few markdown pieces the briefing uses: headings, bullets, a rule and paragraphs. */
function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: number) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${key}`} className="list-disc space-y-1.5 pl-6">
        {bullets.map((b, i) => (
          <li key={i}>{inline(b)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };
  source.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flush(i);
    if (!line.trim()) return;
    if (line.startsWith("## ")) blocks.push(<h2 key={i} className="pt-4 text-lg font-bold">{inline(line.slice(3))}</h2>);
    else if (line.startsWith("# ")) blocks.push(<h1 key={i} className="text-2xl font-bold">{inline(line.slice(2))}</h1>);
    else if (/^-{3,}$/.test(line.trim())) blocks.push(<hr key={i} className="my-4 border-t-2 border-outline" />);
    else blocks.push(<p key={i} className="leading-relaxed">{inline(line)}</p>);
  });
  flush(source.length);
  return <div className="space-y-2 text-sm">{blocks}</div>;
}

export default function UnderstandingView() {
  const { organization } = useOrganizationStore();
  const orgId = organization?.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const detail = async (res: Response, fallback: string) => {
    try {
      const body = await res.json();
      return typeof body?.detail === "string" ? body.detail : fallback;
    } catch {
      return fallback;
    }
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetch(`${API_URL}/business-profile?organization_id=${encodeURIComponent(orgId)}`, { headers: getAuthHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error(await detail(res, "Could not load this."));
        return (await res.json()).profile as Profile | null;
      })
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const regenerate = async () => {
    if (!orgId || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/business-profile/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ organization_id: orgId }),
      });
      if (!res.ok) throw new Error(await detail(res, "Could not write it just now. Please try again."));
      setProfile((await res.json()).profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to the clipboard.");
    }
  };

  const download = () => {
    if (!profile) return;
    const blob = new Blob([profile.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slug = (organization?.name || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    link.href = url;
    link.download = `yesboss-understanding-${slug}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          What YesBoss understands about your business and about you, written from your company records. It never uses your private journal, mood or chats.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {profile && (
            <>
              <Button variant="outline" size="sm" onClick={() => void copy()}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" onClick={download}>
                <Download className="h-4 w-4" /> Download .md
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => void regenerate()} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : profile ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Writing…" : profile ? "Regenerate" : "Write it now"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-2xl border-2 border-outline bg-rose-500/10 px-4 py-2 text-sm text-rose-400" role="alert">
          {error}
        </p>
      )}

      {profile ? (
        <Card>
          <Markdown source={profile.markdown} />
          <p className="mt-4 text-xs text-text-muted">
            {profile.generated_at ? `Updated ${new Date(profile.generated_at).toLocaleString()}. ` : ""}
            {profile.provider === "ai" ? "Written by AI from your records." : "Written from your records without AI: the AI service was not available."}
          </p>
        </Card>
      ) : (
        !error && (
          <Card className="text-center">
            <Sparkles className="mx-auto mb-2 h-7 w-7 text-primary" />
            <p className="font-bold">YesBoss hasn&apos;t written this down yet.</p>
            <p className="mt-1 text-sm text-text-muted">Press &quot;Write it now&quot; and it will read your company profile, team, goals, tasks and documents.</p>
          </Card>
        )
      )}
    </div>
  );
}
