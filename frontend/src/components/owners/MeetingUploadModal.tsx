"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useZohoStore } from "@/stores/zohoStore";
import {
  Modal, ModalHeader, ModalTitle, ModalClose, ModalContent, ModalFooter,
} from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FileText, Upload, Loader2, CheckCircle, AlertCircle, X, Calendar, Clock, User, Search } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface MeetingUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface OrgMember {
  _id: string;
  full_name: string;
  email: string;
  role?: string;
  department?: string;
}

export default function MeetingUploadModal({ open, onOpenChange, onSuccess }: MeetingUploadModalProps) {
  const { organization } = useOrganizationStore();
  const { connected } = useZohoStore();
  const [tab, setTab] = useState<"file" | "calendar">("file");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ meeting_id: string; tasks_created: any[]; task_count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Title autocomplete
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [showTitleDropdown, setShowTitleDropdown] = useState(false);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const titleRef = useRef<HTMLDivElement>(null);

  // Participant multi-select
  const [selectedParticipants, setSelectedParticipants] = useState<OrgMember[]>([]);
  const [participantQuery, setParticipantQuery] = useState("");
  const [participantSuggestions, setParticipantSuggestions] = useState<OrgMember[]>([]);
  const [showParticipantDropdown, setShowParticipantDropdown] = useState(false);
  const [searchingParticipants, setSearchingParticipants] = useState(false);
  const participantDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const participantInputRef = useRef<HTMLDivElement>(null);

  // Calendar tab state
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");

  useEffect(() => {
    if (connected && tab === "calendar") {
      fetchCalendarEvents();
    }
  }, [connected, tab]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (titleRef.current && !titleRef.current.contains(e.target as Node)) {
        setShowTitleDropdown(false);
      }
      if (participantInputRef.current && !participantInputRef.current.contains(e.target as Node)) {
        setShowParticipantDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const fetchTitleSuggestions = useCallback(async (q: string) => {
    if (!organization?.id || q.length < 1) {
      setTitleSuggestions([]);
      setShowTitleDropdown(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/meetings/titles?q=${encodeURIComponent(q)}&organization_id=${organization.id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTitleSuggestions(data.titles || []);
        setShowTitleDropdown(data.titles?.length > 0);
      }
    } catch {}
  }, [organization?.id]);

  const fetchParticipantSuggestions = useCallback(async (q: string) => {
    if (!organization?.id || q.length < 1) {
      setParticipantSuggestions([]);
      setShowParticipantDropdown(false);
      return;
    }
    setSearchingParticipants(true);
    try {
      const res = await fetch(`${API_URL}/org-chart/members/search?q=${encodeURIComponent(q)}&organization_id=${organization.id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const alreadySelected = new Set(selectedParticipants.map((p) => p.email.toLowerCase()));
        const filtered = (data.members || []).filter((m: OrgMember) => !alreadySelected.has(m.email.toLowerCase()));
        setParticipantSuggestions(filtered);
        setShowParticipantDropdown(filtered.length > 0);
      }
    } catch {} finally {
      setSearchingParticipants(false);
    }
  }, [organization?.id, selectedParticipants]);

  const onTitleChange = (val: string) => {
    setTitle(val);
    clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => fetchTitleSuggestions(val), 200);
  };

  const onParticipantQueryChange = (val: string) => {
    setParticipantQuery(val);
    clearTimeout(participantDebounceRef.current);
    participantDebounceRef.current = setTimeout(() => fetchParticipantSuggestions(val), 200);
  };

  const addParticipant = (member: OrgMember) => {
    if (selectedParticipants.find((p) => p.email === member.email)) return;
    setSelectedParticipants([...selectedParticipants, member]);
    setParticipantQuery("");
    setParticipantSuggestions([]);
    setShowParticipantDropdown(false);
  };

  const removeParticipant = (email: string) => {
    setSelectedParticipants(selectedParticipants.filter((p) => p.email !== email));
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
      const participantEmails = selectedParticipants.map((p) => p.email).join(",");
      if (participantEmails) {
        formData.append("participants", participantEmails);
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
    setFile(null);
    setError("");
    setResult(null);
    setSelectedEventId("");
    setTab("file");
    setTitleSuggestions([]);
    setShowTitleDropdown(false);
    setSelectedParticipants([]);
    setParticipantQuery("");
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
              <div className="space-y-2 max-h-60 overflow-y-auto">
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
            {/* Meeting Title with Autocomplete */}
            <div ref={titleRef} className="relative">
              <Input
                placeholder="Meeting title (required)"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                icon={<FileText className="w-4 h-4" />}
                disabled={loading}
                onFocus={() => { if (titleSuggestions.length > 0) setShowTitleDropdown(true); }}
              />
              {showTitleDropdown && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-surface border border-border/50 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {titleSuggestions.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setTitle(t); setShowTitleDropdown(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary/10 transition-colors cursor-pointer border-b border-border/20 last:border-0"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Participants Multi-Select from Org Chart */}
            <div ref={participantInputRef} className="relative">
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-surface border border-border/50 min-h-[42px]">
                {selectedParticipants.map((p) => (
                  <span key={p.email} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-xs font-medium text-primary">
                    <User className="w-3 h-3" />
                    {p.full_name}
                    <button type="button" onClick={() => removeParticipant(p.email)} className="hover:text-rose-400 transition-colors cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm px-1 py-0.5"
                  placeholder={selectedParticipants.length === 0 ? "Search participants from org chart..." : "Add more..."}
                  value={participantQuery}
                  onChange={(e) => onParticipantQueryChange(e.target.value)}
                  onFocus={() => { if (participantSuggestions.length > 0) setShowParticipantDropdown(true); }}
                  disabled={loading}
                />
                {searchingParticipants && <Loader2 className="w-4 h-4 animate-spin text-text-muted self-center" />}
              </div>
              {showParticipantDropdown && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-surface border border-border/50 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {participantSuggestions.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-text-muted">No matches found</div>
                  ) : (
                    participantSuggestions.map((m) => (
                      <button
                        key={m._id}
                        type="button"
                        onClick={() => addParticipant(m)}
                        className="w-full text-left px-4 py-2.5 hover:bg-primary/10 transition-colors cursor-pointer border-b border-border/20 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-text-muted flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{m.full_name}</p>
                            <p className="text-xs text-text-muted truncate">
                              {[m.role, m.department].filter(Boolean).join(" · ") || m.email}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* File / Calendar Tab */}
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
