"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOrganizationStore } from "@/stores/organizationStore";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from "@/components/ui";
import {
  FileText,
  Loader2,
  Calendar,
  User as UserIcon,
  HardDrive,
  Search,
  ExternalLink,
  Trash2,
  Upload as UploadIcon,
  Pencil,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const ALLOWED_EXT = [
  ".pdf", ".docx", ".txt", ".csv", ".xlsx", ".xls", ".png", ".jpg", ".jpeg",
];
const MAX_SIZE = 25 * 1024 * 1024;

interface UploadedFile {
  id: string;
  filename: string;
  file_type: string;
  source: string;
  text_length?: number;
  created_at: string;
}

function validateFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
    return `Unsupported file type. Allowed: ${ALLOWED_EXT.join(", ")}`;
  }
  if (file.size > MAX_SIZE) {
    return `File too large (max 25 MB).`;
  }
  return null;
}

interface UploadStatus {
  name: string;
  progress: "uploading" | "done" | "failed";
  error?: string;
}

export function YourFilesCard({ onFilesChanged }: { onFilesChanged?: () => void }) {
  const { organization } = useOrganizationStore();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState<UploadStatus[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [renaming, setRenaming] = useState(false);

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
  }, [organization]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    loadFiles();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadFiles]);

  const handleDelete = async (fileId: string) => {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    setDeleting(fileId);
    try {
      const res = await fetch(
        `${API_URL}/executive-chat/files/${fileId}?organization_id=${organization?.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        onFilesChanged?.();
      }
    } catch {}
    setDeleting(null);
  };

  const handleUploadFiles = useCallback(
    async (incoming: File[]) => {
      if (!organization?.id) return;
      const valid: File[] = [];
      const rejected: { name: string; reason: string }[] = [];
      for (const f of incoming) {
        const err = validateFile(f);
        if (err) rejected.push({ name: f.name, reason: err });
        else valid.push(f);
      }

      if (rejected.length > 0) {
        setUploading((prev) => [
          ...prev,
          ...rejected.map((r) => ({ name: r.name, progress: "failed" as const, error: r.reason })),
        ]);
      }
      if (valid.length === 0) return;

      setUploading((prev) => [
        ...prev,
        ...valid.map((f) => ({ name: f.name, progress: "uploading" as const })),
      ]);

      await Promise.all(
        valid.map(async (file) => {
          try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("organization_id", organization.id);
            const res = await fetch(`${API_URL}/executive-chat/upload-and-analyze`, {
              method: "POST",
              body: formData,
            });
            if (!res.ok) {
              let detail = "Upload failed";
              try {
                const body = await res.json();
                detail = body.detail || detail;
              } catch {}
              setUploading((prev) =>
                prev.map((u) => (u.name === file.name ? { ...u, progress: "failed", error: detail } : u))
              );
            } else {
              setUploading((prev) =>
                prev.map((u) => (u.name === file.name ? { ...u, progress: "done" } : u))
              );
              loadFiles();
              onFilesChanged?.();
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("kpi-document-uploaded", { detail: { filename: file.name } })
                );
              }
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : "Network error";
            setUploading((prev) =>
              prev.map((u) => (u.name === file.name ? { ...u, progress: "failed", error: message } : u))
            );
          }
        })
      );
    },
    [organization, loadFiles, onFilesChanged]
  );

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    handleUploadFiles(Array.from(list));
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const list = e.dataTransfer.files;
    if (!list || list.length === 0) return;
    handleUploadFiles(Array.from(list));
  };

  const startRename = (file: UploadedFile) => {
    setEditingId(file.id);
    setEditingName(file.filename);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingName("");
  };

  const commitRename = async (fileId: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      cancelRename();
      return;
    }
    const original = files.find((f) => f.id === fileId);
    if (original && original.filename === trimmed) {
      cancelRename();
      return;
    }
    setRenaming(true);
    try {
      const res = await fetch(
        `${API_URL}/executive-chat/files/${fileId}?organization_id=${organization?.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: trimmed }),
        }
      );
      if (res.ok) {
        setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, filename: trimmed } : f)));
        cancelRename();
      } else {
        let detail = "Rename failed";
        try {
          const body = await res.json();
          detail = body.detail || detail;
        } catch {}
        alert(detail);
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setRenaming(false);
    }
  };

  const dismissUpload = (name: string) => {
    setUploading((prev) => prev.filter((u) => u.name !== name));
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-primary" />
            <CardTitle>Your Files</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {files.length} file{files.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <CardDescription>
          Every file you&apos;ve uploaded is stored and analyzed by AI for business insights.
          Drag &amp; drop or click below to add more.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 py-4 px-3 mb-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-surface-light/50"
          }`}
        >
          <UploadIcon className="w-5 h-5 text-text-muted" />
          <p className="text-xs font-medium">
            {dragOver ? "Drop files to upload" : "Click or drag files here"}
          </p>
          <p className="text-[10px] text-text-muted">
            PDF, DOCX, TXT, CSV, XLSX, PNG, JPG (max 25 MB each)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_EXT.join(",")}
            onChange={onFileInputChange}
            className="hidden"
          />
        </div>

        {uploading.length > 0 && (
          <div className="space-y-2 mb-4">
            {uploading.map((u, i) => (
              <div
                key={`${u.name}-${i}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface border border-border/50"
              >
                {u.progress === "uploading" && (
                  <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                )}
                {u.progress === "done" && (
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                )}
                {u.progress === "failed" && (
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p
                    className={`text-xs ${
                      u.progress === "failed" ? "text-rose-400" : "text-text-muted"
                    }`}
                  >
                    {u.progress === "uploading" && "Uploading & analyzing..."}
                    {u.progress === "done" && "Uploaded & analyzed"}
                    {u.progress === "failed" && (u.error || "Upload failed")}
                  </p>
                </div>
                {u.progress !== "uploading" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissUpload(u.name);
                    }}
                    className="p-1.5 rounded-lg hover:bg-surface-light text-text-muted hover:text-foreground transition-colors flex-shrink-0"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

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
                : "Drag & drop a file above, or use the AI Business Analytics chat to add files. All files are automatically analyzed."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-4 p-4 rounded-xl bg-surface hover:bg-surface-light transition-all border border-border/50 group"
              >
                <div
                  onClick={() => window.open(`${API_URL}/executive-chat/files/${file.id}/download`, "_blank")}
                  className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 cursor-pointer"
                >
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  {editingId === file.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(file.id);
                          if (e.key === "Escape") cancelRename();
                        }}
                        onBlur={() => {
                          if (renaming) return;
                          commitRename(file.id);
                        }}
                        autoFocus
                        disabled={renaming}
                        className="flex-1 min-w-0 px-2 py-1 rounded-md bg-surface-light border border-primary text-sm focus:outline-none"
                      />
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => commitRename(file.id)}
                        disabled={renaming}
                        className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-50"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={cancelRename}
                        disabled={renaming}
                        className="p-1.5 rounded-md text-text-muted hover:bg-surface-light hover:text-foreground cursor-pointer disabled:opacity-50"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p
                        onClick={() => window.open(`${API_URL}/executive-chat/files/${file.id}/download`, "_blank")}
                        className="font-medium truncate cursor-pointer hover:text-primary transition-colors"
                      >
                        {file.filename}
                      </p>
                      <button
                        onClick={() => startRename(file)}
                        className="p-1 rounded-md text-text-muted hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-text-muted mt-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {file.file_type}
                    </Badge>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(file.created_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3 h-3" />
                      {file.source === "chat-upload" ? "Chat upload" : "Onboarding"}
                    </span>
                    {file.text_length && (
                      <span className="text-text-muted/60">
                        {(file.text_length / 1000).toFixed(1)}K chars
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => window.open(`${API_URL}/executive-chat/files/${file.id}/download`, "_blank")}
                    className="p-2 rounded-lg hover:bg-surface-light text-text-muted hover:text-foreground transition-colors cursor-pointer"
                    title="Download / open"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(file.id)}
                    disabled={deleting === file.id}
                    className="p-2 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
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
  );
}
