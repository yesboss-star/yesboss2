"use client";

import { useCallback, useState } from "react";
import { useDocumentStore, type DocumentSuggestion } from "@/stores/documentStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { downloadDocumentTemplate } from "@/lib/documentTemplates";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { Sparkles, FileText, FileDown, Loader2, Lightbulb, RefreshCw } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface OrgMeta {
  organizationName: string;
  industry: string;
  microVertical: string;
  size: string;
  domain?: string;
  existingDocuments?: { filename: string }[];
}

function shorten(text: string, max: number): string {
  const t = (text || "").trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice) + "…";
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-400",
  medium: "bg-cyan-500/15 text-cyan-400",
  low: "bg-text-muted/15 text-text-muted",
};

export function SuggestedDocumentsCard({ orgMeta, title = "Documents that drive growth" }: { orgMeta: OrgMeta; title?: string }) {
  const {
    suggestions: docSuggestions,
    suggestionsLoading,
    fetchSuggestions: fetchDocSuggestions,
  } = useDocumentStore();
  const { organization } = useOrganizationStore();
  const orgId = organization?.id;
  const [templateDownloading, setTemplateDownloading] = useState<string | null>(null);

  const loadData = useCallback(() => {
    if (!orgId || !orgMeta.organizationName) return;
    fetch(`${API_URL}/executive-chat/files?organization_id=${orgId}`)
      .then((r) => r.json())
      .then((data) => {
        const files = Array.isArray(data?.files) ? data.files : [];
        const filenames = files.map((f: { filename: string }) => ({ filename: f.filename }));
        fetchDocSuggestions({
          domain: orgMeta.domain || "",
          company_name: orgMeta.organizationName,
          industry: orgMeta.industry || "",
          micro_vertical: orgMeta.microVertical || "",
          size: orgMeta.size || "",
          existing_documents:
            orgMeta.existingDocuments && orgMeta.existingDocuments.length > 0
              ? orgMeta.existingDocuments
              : filenames,
        });
      })
      .catch(() => {});
  }, [orgId, orgMeta, fetchDocSuggestions]);

  const handleTemplateDownload = async (s: DocumentSuggestion) => {
    const key = s.title;
    setTemplateDownloading(key);
    try {
      await downloadDocumentTemplate(
        {
          title: s.title,
          category: s.category,
          whyItHelps: s.why_it_helps,
          exampleContents: s.example_contents,
        },
        orgMeta.organizationName || "Your Company"
      );
    } catch (err) {
      console.error("Template download failed:", err);
    } finally {
      setTemplateDownloading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
          <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle>{title}</CardTitle>
          </div>
          <button
            onClick={loadData}
            disabled={suggestionsLoading}
            className="p-1.5 rounded-lg hover:bg-surface-light text-text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh suggestions"
          >
            <RefreshCw className={`w-4 h-4 ${suggestionsLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <CardDescription>
          AI-tailored suggestions based on your industry, stage and what you have already uploaded.
          Download a Word template, fill it in, and upload it back so your AI can give sharper answers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!orgMeta.organizationName ? (
          <div className="flex items-center gap-2 text-sm text-text-muted italic">
            <Lightbulb className="w-4 h-4" />
            Add your company name and industry to unlock tailored suggestions.
          </div>
        ) : docSuggestions.length === 0 && !suggestionsLoading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted italic">
            <Lightbulb className="w-4 h-4" />
            No suggestions available yet. Try refreshing or add more industry details.
          </div>
        ) : (
          <div className="space-y-2">
            {docSuggestions.map((s, i) => (
              <div
                key={`${s.title}-${i}`}
                className="rounded-xl border border-border bg-surface/40 p-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{s.title}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                          PRIORITY_STYLES[s.priority] || PRIORITY_STYLES.low
                        }`}
                      >
                        {s.priority}
                      </span>
                      <span className="text-[10px] text-text-muted capitalize">
                        {s.category.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      {shorten(s.why_it_helps, 140)}
                    </p>
                    {s.example_contents && (
                      <p className="text-[11px] text-text-muted/70 mt-1 italic">
                        e.g. {shorten(s.example_contents, 80)}
                      </p>
                    )}
                    <div className="mt-2">
                      <button
                        onClick={() => handleTemplateDownload(s)}
                        disabled={templateDownloading === s.title}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:border-primary/60 hover:text-primary text-xs font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Download an AI-generated Word template for this document"
                      >
                        {templateDownloading === s.title ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5" />
                        )}
                        Download template (.docx)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
