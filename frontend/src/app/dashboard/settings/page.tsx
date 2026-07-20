"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsList, TabsTrigger, TabsContent, Input, Label, Button, Badge } from "@/components/ui";
import { Bell, User, Save, ArrowLeft, Volume2, Mail, Smartphone, Plug, MessageSquare, ExternalLink, X, Camera, RefreshCw, Loader2, Shield, Users } from "lucide-react";
import { Avatar, DICEBEAR_STYLES } from "@/components/ui/Avatar";
import ZohoConnectButton from "@/components/owners/ZohoConnectButton";
import { useZohoStore } from "@/stores/zohoStore";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("yesboss_id_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

const NOTIF_TYPES = [
  { key: "task_assigned", label: "Task Assigned" },
  { key: "task_status", label: "Task Status Changed" },
  { key: "task_completed", label: "Task Completed" },
  { key: "goal_created", label: "Goal Created" },
  { key: "goal_assigned", label: "Goal Assigned" },
  { key: "goal_status", label: "Goal Status Changed" },
  { key: "alert", label: "Alerts" },
];

const DEFAULT_PREFS = {
  email: Object.fromEntries(NOTIF_TYPES.map((t) => [t.key, true])),
  push: Object.fromEntries(NOTIF_TYPES.map((t) => [t.key, true])),
  in_app: Object.fromEntries(NOTIF_TYPES.map((t) => [t.key, true])),
  sound: true,
  digest: { enabled: false, frequency: "never" },
};

export default function SettingsPage() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<any>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ fullName: "", email: "", department: "", role: "" });
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedbackPopupOpen, setFeedbackPopupOpen] = useState(false);
  const [userInfo, setUserInfo] = useState({ name: "", email: "" });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [dicebearStyle, setDicebearStyle] = useState("lorelei");
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("yesboss_user");
    let userName = "", userEmail = "";
    if (stored) {
      try {
        const u = JSON.parse(stored);
        userName = u?.full_name || u?.displayName || "";
        userEmail = u?.email || "";
      } catch {}
    }
    setUserInfo({ name: userName, email: userEmail });
    const headers = getAuthHeaders();

    Promise.all([
      fetch(`${API_URL}/notification-preferences`, { headers }).then(r => r.json()).catch(() => ({})),
      userEmail ? fetch(`${API_URL}/employees/by-email/${encodeURIComponent(userEmail)}`, { headers }).then(r => r.json()).catch(() => ({})) : Promise.resolve({}),
    ]).then(([prefData, empData]) => {
      if (prefData.preferences) setPrefs(prefData.preferences);
      const emp = empData.employee || {};
      if (emp) {
        setProfile({
          fullName: emp.full_name || userName || "",
          email: emp.email || userEmail || "",
          department: emp.department || "",
          role: emp.role || "",
        });
        if (emp.avatar_style) setDicebearStyle(emp.avatar_style);
        setProfileError(false);
      }
      if (userEmail) {
        fetch(`${API_URL}/employees/avatar/${encodeURIComponent(userEmail)}`)
          .then((r) => r.ok ? r.blob() : null)
          .then((blob) => {
            if (blob) {
              const blobUrl = URL.createObjectURL(blob);
              setAvatarUrl(blobUrl);
              useOrganizationStore.getState().setAvatarUrl(blobUrl);
            }
          })
          .catch(() => {});
      }
    }).catch(() => {
      setProfileError(true);
    }).finally(() => {
      setLoading(false);
      setProfileLoading(false);
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("zoho") === "connected") {
      const url = new URL(window.location.href);
      url.searchParams.delete("zoho");
      window.history.replaceState({}, "", url.toString());
      useZohoStore.getState().checkStatus();
      if (window.opener && window.opener !== window) {
        window.close();
      } else {
        useUIStore.getState().addNotification({
          type: "success",
          title: "Zoho Connected",
          message: "Your Zoho account has been connected successfully.",
        });
      }
    }
  }, []);

  const updatePrefs = async (updates: any) => {
    const merged = { ...prefs, ...updates };
    setPrefs(merged);
    try {
      await fetch(`${API_URL}/notification-preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(updates),
      });
    } catch {}
  };

  const toggleChannelType = (channel: string, type: string) => {
    const updated = { ...prefs[channel], [type]: !prefs[channel]?.[type] };
    updatePrefs({ [channel]: updated });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)) {
      useUIStore.getState().addNotification({ type: "error", title: "Invalid File", message: "Please upload a PNG, JPG, GIF, or WebP image." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      useUIStore.getState().addNotification({ type: "error", title: "File Too Large", message: "Max 2MB allowed." });
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("email", profile.email);
      formData.append("file", file);
      const res = await fetch(`${API_URL}/employees/avatar`, { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        const url = `${API_URL}${data.avatar_url}`;
        const blob = await fetch(url).then((r) => r.blob());
        const blobUrl = URL.createObjectURL(blob);
        setAvatarUrl(blobUrl);
        useOrganizationStore.getState().setAvatarUrl(blobUrl);
        useUIStore.getState().addNotification({ type: "success", title: "Avatar Updated", message: "Your profile picture has been updated." });
      } else {
        throw new Error("Upload failed");
      }
    } catch {
      useUIStore.getState().addNotification({ type: "error", title: "Upload Failed", message: "Could not upload avatar. Try again." });
    } finally {
      setAvatarUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarUrl(null);
    useOrganizationStore.getState().setAvatarUrl(undefined);
    useUIStore.getState().addNotification({ type: "success", title: "Avatar Removed", message: "Character avatar will be shown." });
  };

  const handleStyleChange = async (style: string) => {
    setDicebearStyle(style);
    useOrganizationStore.getState().setAvatarStyle(style);
    setShowStylePicker(false);
    setAvatarUrl(null);
    try {
      await fetch(`${API_URL}/employees/persona`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ email: profile.email, avatar_style: style }),
      });
    } catch {}
    useUIStore.getState().addNotification({ type: "success", title: "Avatar Style Changed", message: "Your character avatar style has been updated." });
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
      <div className="w-9 h-5 bg-border rounded-full peer peer-checked:bg-primary transition-colors" />
    </label>
  );

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/notifications")} className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-text-muted mt-1">Manage your account and preferences</p>
          </div>
        </div>

        <Tabs defaultValue="notifications">
          <TabsList className="mb-4">
            <TabsTrigger value="notifications"><Bell className="w-4 h-4 mr-2" /> Notifications</TabsTrigger>
            <TabsTrigger value="profile"><User className="w-4 h-4 mr-2" /> Profile</TabsTrigger>
            <TabsTrigger value="integrations"><Plug className="w-4 h-4 mr-2" /> Integrations</TabsTrigger>
            <TabsTrigger value="feedback"><MessageSquare className="w-4 h-4 mr-2" /> Feedback</TabsTrigger>
          </TabsList>

          <TabsContent value="notifications">
            {loading ? (
              <Card><CardContent className="p-6 text-center text-text-muted">Loading...</CardContent></Card>
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle><Volume2 className="w-4 h-4 inline mr-2" />Sound Alerts</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm">Play sound on new notification</span>
                      <Toggle checked={prefs.sound} onChange={() => updatePrefs({ sound: !prefs.sound })} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle><Mail className="w-4 h-4 inline mr-2" />Email Notifications</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {NOTIF_TYPES.map((t) => (
                      <div key={t.key} className="flex items-center justify-between py-1.5">
                        <span className="text-sm">{t.label}</span>
                        <Toggle checked={prefs.email?.[t.key] ?? true} onChange={() => toggleChannelType("email", t.key)} />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle><Smartphone className="w-4 h-4 inline mr-2" />Push Notifications</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {NOTIF_TYPES.map((t) => (
                      <div key={t.key} className="flex items-center justify-between py-1.5">
                        <span className="text-sm">{t.label}</span>
                        <Toggle checked={prefs.push?.[t.key] ?? true} onChange={() => toggleChannelType("push", t.key)} />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle><Bell className="w-4 h-4 inline mr-2" />In-App Notifications</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {NOTIF_TYPES.map((t) => (
                      <div key={t.key} className="flex items-center justify-between py-1.5">
                        <span className="text-sm">{t.label}</span>
                        <Toggle checked={prefs.in_app?.[t.key] ?? true} onChange={() => toggleChannelType("in_app", t.key)} />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Daily / Weekly Digest</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm">Enable email digest</span>
                      <Toggle checked={prefs.digest?.enabled ?? false} onChange={() => updatePrefs({ digest: { ...prefs.digest, enabled: !prefs.digest?.enabled } })} />
                    </div>
                    {prefs.digest?.enabled && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm">Frequency:</span>
                        {["daily", "weekly"].map((f) => (
                          <button
                            key={f}
                            onClick={() => updatePrefs({ digest: { ...prefs.digest, frequency: f } })}
                            className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${prefs.digest?.frequency === f ? "bg-primary text-white" : "bg-surface hover:bg-border"}`}
                          >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Profile Information</CardTitle>
                  {profileError && (
                    <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="cursor-pointer">
                      <RefreshCw className="w-4 h-4 mr-1" /> Retry
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {profileLoading ? (
                  <p className="text-sm text-text-muted">Loading profile...</p>
                ) : profileError ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-text-muted">Could not load profile data.</p>
                    <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="mt-3 cursor-pointer">
                      <RefreshCw className="w-4 h-4 mr-1" /> Retry
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-6">
                      <div className="relative group">
                        <div
                          onClick={() => setShowStylePicker(!showStylePicker)}
                          className="cursor-pointer ring-2 ring-border/50 group-hover:ring-primary/50 rounded-full transition-all"
                        >
                          <Avatar
                            size="xl"
                            src={avatarUrl || undefined}
                            seed={profile.email || profile.fullName}
                            dicebearStyle={dicebearStyle}
                            fallback={profile.fullName}
                          />
                        </div>
                        <div className="absolute -bottom-1 -right-1 flex gap-1">
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center cursor-pointer hover:bg-surface transition-colors shadow-sm"
                            title="Upload photo"
                          >
                            {avatarUploading ? (
                              <Loader2 className="w-4 h-4 text-text-muted animate-spin" />
                            ) : (
                              <Camera className="w-4 h-4 text-text-muted" />
                            )}
                          </div>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          onChange={handleAvatarUpload}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-bold truncate">{profile.fullName || profile.email.split("@")[0] || "User"}</h2>
                        <p className="text-sm text-text-muted truncate">{profile.role || profile.email}</p>
                        <p className="text-xs text-text-muted/60 mt-1">Click avatar to change character style</p>
                      </div>
                    </div>

                    {showStylePicker && (
                      <div className="p-4 rounded-xl bg-surface border border-border">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium">Choose Character Style</p>
                          <button onClick={() => setShowStylePicker(false)} className="text-text-muted hover:text-foreground cursor-pointer">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          {DICEBEAR_STYLES.map((style) => (
                            <button
                              key={style}
                              onClick={() => handleStyleChange(style)}
                              className={`p-2 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center gap-1 ${
                                dicebearStyle === style
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:border-primary/40"
                              }`}
                            >
                              <Avatar size="sm" seed={profile.email || profile.fullName} dicebearStyle={style} />
                              <span className="text-[10px] text-text-muted capitalize truncate w-full text-center">
                                {style.replace(/-/g, " ")}
                              </span>
                            </button>
                          ))}
                        </div>
                        {avatarUrl && (
                          <button
                            onClick={handleRemoveAvatar}
                            className="mt-3 text-xs text-text-muted hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            Remove custom photo &rarr; use character avatar
                          </button>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Full Name</Label><Input value={profile.fullName} placeholder={profile.email.split("@")[0]} onChange={(e) => setProfile({...profile, fullName: e.target.value})} /></div>
                      <div><Label>Email</Label><Input value={profile.email} onChange={(e) => setProfile({...profile, email: e.target.value})} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Department</Label><Input value={profile.department} placeholder="e.g. Engineering" onChange={(e) => setProfile({...profile, department: e.target.value})} /></div>
                      <div><Label>Role / Title</Label><Input value={profile.role} placeholder="e.g. Software Engineer" onChange={(e) => setProfile({...profile, role: e.target.value})} /></div>
                    </div>

                    <div className="flex justify-end pt-2 border-t border-border/50">
                      <Button
                        disabled={saving}
                        onClick={async () => {
                          setSaving(true);
                          try {
                            const res = await fetch(`${API_URL}/employees/persona`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                              body: JSON.stringify({
                                email: profile.email,
                                department: profile.department,
                                role: profile.role,
                                avatar_style: dicebearStyle,
                              }),
                            });
                            if (res.ok) {
                              useOrganizationStore.getState().setAvatarStyle(dicebearStyle);
                              useUIStore.getState().addNotification({
                                type: "success", title: "Profile Updated", message: "Your profile has been saved.",
                              });
                            } else {
                              throw new Error("Save failed");
                            }
                          } catch {
                            useUIStore.getState().addNotification({
                              type: "error", title: "Save Failed", message: "Could not save profile. Try again.",
                            });
                          } finally {
                            setSaving(false);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <Save className="w-4 h-4 mr-2" /> {saving ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <CardTitle>Organization Owners</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <OwnerList />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations">
            <Card>
              <CardHeader>
                <CardTitle><Plug className="w-4 h-4 inline mr-2" /> Zoho Integration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Zoho Mail & Calendar</p>
                    <p className="text-xs text-text-muted mt-1">
                      Connect your Zoho account to sync tasks bidirectionally and access your calendar.
                    </p>
                  </div>
                  <ZohoConnectButton />
                </div>
                <div className="p-3 rounded-xl bg-surface border border-border/50">
                  <h4 className="text-xs font-medium text-text-muted mb-2">What gets connected?</h4>
                  <ul className="space-y-1 text-xs text-text-muted">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">&bull;</span>
                      Tasks created in yesboss appear in your Zoho Mail To-Do
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">&bull;</span>
                      Completing a task in Zoho Mail syncs the status back
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">&bull;</span>
                      Calendar events synced for meeting creation
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">&bull;</span>
                      Book meetings with free/busy availability check
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <CardTitle><MessageSquare className="w-4 h-4 inline mr-2" /> Send Feedback</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-text-muted">
                  Have a suggestion or found a bug? We'd love to hear from you.
                </p>
                <button
                  onClick={() => setFeedbackPopupOpen(true)}
                  className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-5 h-5" />
                  Send Feedback
                </button>
              </CardContent>
            </Card>

            {/* Feedback popup */}
            {feedbackPopupOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
                <div className="w-full max-w-sm rounded-2xl bg-background border border-border p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold">Choose email client</h3>
                    <button
                      onClick={() => setFeedbackPopupOpen(false)}
                      className="text-text-muted hover:text-foreground cursor-pointer p-1"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-sm text-text-muted mb-4">
                    Your feedback will be sent to our team via email.
                  </p>
                  <div className="space-y-2">
                    {[
                      { name: "Gmail", icon: "📧", link: `mailto:yesbossvsllp1@gmail.com?subject=${encodeURIComponent(`YesBoss Feedback - ${userInfo.name}`)}&body=${encodeURIComponent(`Hi YesBoss Team,\n\nI'd like to share some feedback:\n\n---\nName: ${userInfo.name}\nEmail: ${userInfo.email}\n\n`)}` },
                      { name: "Outlook", icon: "📧", link: `mailto:yesbossvsllp1@gmail.com?subject=${encodeURIComponent(`YesBoss Feedback - ${userInfo.name}`)}&body=${encodeURIComponent(`Hi YesBoss Team,\n\nI'd like to share some feedback:\n\n---\nName: ${userInfo.name}\nEmail: ${userInfo.email}\n\n`)}` },
                      { name: "Zoho Mail", icon: "📧", link: `mailto:yesbossvsllp1@gmail.com?subject=${encodeURIComponent(`YesBoss Feedback - ${userInfo.name}`)}&body=${encodeURIComponent(`Hi YesBoss Team,\n\nI'd like to share some feedback:\n\n---\nName: ${userInfo.name}\nEmail: ${userInfo.email}\n\n`)}` },
                    ].map((option) => (
                      <a
                        key={option.name}
                        href={option.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border hover:border-primary/50 transition-all group cursor-pointer"
                      >
                        <span className="text-xl">{option.icon}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{option.name}</p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

interface Owner {
  uid: string;
  email: string;
  full_name: string;
  role: "primary_owner" | "co_owner";
}

function OwnerList() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const organization = useOrganizationStore((s) => s.organization);
  const { user } = useAuth();
  const currentUserEmail = user?.email;
  const avatarUrl = useOrganizationStore((s) => s.avatarUrl);
  const avatarStyle = useOrganizationStore((s) => s.avatarStyle) || "lorelei";

  useEffect(() => {
    if (!organization?.id) {
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/organizations/${organization.id}/owners`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((data) => {
        setOwners(data.owners || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [organization?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!organization?.id) {
    return (
      <p className="text-sm text-text-muted text-center py-4">No organization found.</p>
    );
  }

  if (owners.length === 0) {
    return (
      <p className="text-sm text-text-muted text-center py-4">No owners found.</p>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {owners.map((owner) => {
        const isCurrentUser = owner.email === currentUserEmail;
        return (
          <div key={owner.uid} className="flex items-center gap-3 py-3">
            <Avatar
              size="md"
              src={isCurrentUser ? avatarUrl : undefined}
              seed={owner.email || owner.full_name}
              dicebearStyle={isCurrentUser ? avatarStyle : undefined}
              fallback={owner.full_name || owner.email}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{owner.full_name || owner.email.split("@")[0]}</p>
              <p className="text-xs text-text-muted truncate">{owner.email}</p>
            </div>
            <Badge
              variant={owner.role === "primary_owner" ? "success" : "secondary"}
            >
              {owner.role === "primary_owner" ? "Primary Owner" : "Co-owner"}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
