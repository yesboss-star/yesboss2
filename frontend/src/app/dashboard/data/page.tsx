"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrganizationStore } from "@/stores/organizationStore";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from "@/components/ui";
import { FileText, Download, Loader2, Calendar, User, HardDrive, Search, ExternalLink, Trash2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface UploadedFile {
  id: string;
  filename: string;
  file_type: string;
  source: string;
  text_length?: number;
  created_at: string;
}

export default function UploadedDataPage() {
  const { organization } = useOrganizationStore();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadFiles = useCallback(() => {
    if (!organization?.id) return;
    setLoading(true);
    fetch(`${API_URL}/executive-chat/files?organization_id=${organization.id}`)
      .then((r) => r.json())
      .then((data) => {
        setFiles(data.files || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [organization?.id]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleDelete = async (fileId: string) => {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    setDeleting(fileId);
    try {
      const res = await fetch(`${API_URL}/executive-chat/files/${fileId}?organization_id=${organization?.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
      }
    } catch {}
    setDeleting(null);
  };

  const filtered = files.filter((f) =>
    f.filename.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
      });
    } catch {
      return d;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
              Uploaded Data
            </h1>
            <p className="text-text-muted mt-1">
              All files uploaded during onboarding, from the AI chat, and document processing
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {files.length} file{files.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-primary" />
              <CardTitle>Your Files</CardTitle>
            </div>
            <CardDescription>
              Every file you've uploaded is stored and analyzed by AI for business insights
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search files..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="w-12 h-12 text-text-muted/40 mb-3" />
                <h3 className="text-sm font-semibold text-text-muted mb-1">
                  {search ? "No files match your search" : "No files uploaded yet"}
                </h3>
                <p className="text-xs text-text-muted/60 max-w-sm">
                  {search
                    ? "Try a different search term."
                    : "Upload files in the AI Business Analytics chat on the dashboard, or during onboarding. All files are automatically analyzed."
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => window.open(`${API_URL}/executive-chat/files/${file.id}/download`, '_blank')}
                    className="flex items-center gap-4 p-4 rounded-xl bg-surface hover:bg-surface-light transition-all border border-border/50 group cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.filename}</p>
                      <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {file.file_type}
                        </Badge>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(file.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {file.source === "chat-upload" ? "Chat upload" : "Onboarding"}
                        </span>
                        {file.text_length && (
                          <span className="text-text-muted/60">
                            {(file.text_length / 1000).toFixed(1)}K chars
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <ExternalLink className="w-4 h-4 text-text-muted" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }}
                        disabled={deleting === file.id}
                        className="p-2 rounded-lg hover:bg-rose-500/10 transition-colors"
                        title="Delete file"
                      >
                        {deleting === file.id ? (
                          <Loader2 className="w-4 h-4 text-rose-400 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4 text-rose-400" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}