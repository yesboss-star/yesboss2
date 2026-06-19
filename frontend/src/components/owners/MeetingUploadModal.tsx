"use client";

import { useState, useRef, useEffect } from "react";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useZohoStore } from "@/stores/zohoStore";
import {
  Modal, ModalHeader, ModalTitle, ModalClose, ModalContent, ModalFooter,
} from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FileText, Upload, Loader2, CheckCircle, AlertCircle, X, Calendar, Clock, User } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface MeetingUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function MeetingUploadModal({ open, onOpenChange, onSuccess }: MeetingUploadModalProps) {
  const { organization } = useOrganizationStore();
  const { connected } = useZohoStore();
  const [tab, setTab] = useState<"file" | "calendar">("file");
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ meeting_id: string; tasks_created: any[]; task_count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calendar tab state
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");

  useEffect(() => {
    if (connected && tab === "calendar") {
      fetchCalendarEvents();
    }
  }, [connected, tab]);

  const fetchCalendarEvents = async () => {
    setCalLoading(true);
    try {
      const res = await fetch(`${API_URL}/zoho/calendar/events?limit=20`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCalendarEvents(data.events || []);
      }
    } catch {} finally {
      setCalLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleSubmit = async () => {
    if (!title.trim() && !selectedEventId) { setError("Meeting title is required"); return; }
    if (tab === "file" && !file) { setError("Please select a file"); return; }
    if (!organization?.id) { setError("Organization not found"); return; }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("meeting_title", title.trim());
      formData.append("organization_id", organization.id);
      if (participants.trim()) {
        formData.append("participants", participants.trim());
      }

      if (tab === "calendar" && selectedEventId) {
        formData.append("zoho_event_id", selectedEventId);
      } else if (tab === "file" && file) {
        formData.append("file", file);
      }

      const res = await fetch(`${API_URL}/meetings/process`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(err.detail || "Failed to process meeting");
      }

      const data = await res.json();
      setResult(data);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setTitle("");
    setParticipants("");
    setFile(null);
    setError("");
    setResult(null);
    setSelectedEventId("");
    setTab("file");
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={handleClose} size="lg">
      <ModalHeader>
        <ModalTitle>Upload Meeting Notes</ModalTitle>
        <ModalClose />
      </ModalHeader>
      <ModalContent>
        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-emerald-400">Meeting Processed Successfully</p>
                <p className="text-sm text-text-muted">{result.task_count} tasks created</p>
              </div>
            </div>
            {result.tasks_created.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Created Tasks:</p>
                {result.tasks_created.map((t: any, i: number) => (
                  <div key={t.id || i} className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border/50">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-text-muted capitalize">Priority: {t.priority}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              placeholder="Meeting title (required)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              icon={<FileText className="w-4 h-4" />}
              disabled={loading}
            />
            <Input
              placeholder="Participants (optional, comma-separated)"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              icon={<User className="w-4 h-4" />}
              disabled={loading}
            />

            <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border/50">
              <button
                onClick={() => setTab("file")}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${tab === "file" ? "bg-primary text-white" : "text-text-muted hover:text-foreground"}`}
              >
                <Upload className="w-3.5 h-3.5 inline mr-1.5" />File
              </button>
              <button
                onClick={() => setTab("calendar")}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${tab === "calendar" ? "bg-primary text-white" : "text-text-muted hover:text-foreground"}`}
                disabled={!connected}
              >
                <Calendar className="w-3.5 h-3.5 inline mr-1.5" />Calendar
              </button>
            </div>

            {tab === "file" ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
                  file
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-surface/50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.pdf,.docx,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={loading}
                />
                <Upload className={`w-8 h-8 mb-2 ${file ? "text-primary" : "text-text-muted"}`} />
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-medium text-primary">{file.name}</p>
                    <p className="text-xs text-text-muted">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-medium text-text-muted">Drop file here or click to browse</p>
                    <p className="text-xs text-text-muted/60 mt-1">Supports: txt, md, pdf, docx, csv</p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {!connected ? (
                  <p className="text-sm text-text-muted text-center py-4">
                    Connect Zoho in Settings &gt; Integrations to import calendar events.
                  </p>
                ) : calLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
                  </div>
                ) : calendarEvents.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-text-muted">No calendar events synced yet.</p>
                    <p className="text-xs text-text-muted/60 mt-1">Events sync every 15 minutes.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {calendarEvents.map((ev: any) => (
                      <button
                        key={ev._id}
                        onClick={() => {
                          setSelectedEventId(ev.zoho_event_id);
                          if (!title.trim()) setTitle(ev.title || "");
                        }}
                        className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                          selectedEventId === ev.zoho_event_id
                            ? "border-primary bg-primary/10"
                            : "border-border/50 bg-surface hover:border-primary/30"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
                          <span className="text-sm font-medium truncate">{ev.title}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted">
                          {ev.start && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{ev.start}</span>}
                          {ev.attendees?.length > 0 && <span className="flex items-center gap-1"><User className="w-3 h-3" />{ev.attendees.length} attendees</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}
      </ModalContent>
      <ModalFooter>
        {result ? (
          <Button variant="primary" onClick={handleClose} className="cursor-pointer">
            Done
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={handleClose} className="cursor-pointer" disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              className="cursor-pointer"
              disabled={loading || !title.trim() || (tab === "file" && !file) || (tab === "calendar" && !selectedEventId)}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {loading ? "Processing..." : "Process Meeting"}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
