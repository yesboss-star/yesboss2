"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsList, TabsTrigger, TabsContent, Input, Label, Button } from "@/components/ui";
import { Bell, User, Save, ArrowLeft, Volume2, Mail, Smartphone, Plug, MessageSquare, ExternalLink, X } from "lucide-react";
import ZohoConnectButton from "@/components/owners/ZohoConnectButton";
import { useZohoStore } from "@/stores/zohoStore";
import { useUIStore } from "@/stores/uiStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getAuthHeaders(): Record<string, string> {
  const stored = localStorage.getItem("yesboss_user");
  if (!stored) return {};
  try {
    const user = JSON.parse(stored);
    return { "X-User-ID": user?.uid || "", "X-User-Email": user?.email || "" };
  } catch { return {}; }
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
      setProfile({
        fullName: emp.full_name || userName || "",
        email: emp.email || userEmail || "",
        department: emp.department || "",
        role: emp.role || "",
      });
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
              <CardHeader><CardTitle>Profile Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {profileLoading ? (
                  <p className="text-sm text-text-muted">Loading profile...</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Full Name</Label><Input value={profile.fullName} onChange={(e) => setProfile({...profile, fullName: e.target.value})} /></div>
                      <div><Label>Email</Label><Input value={profile.email} onChange={(e) => setProfile({...profile, email: e.target.value})} /></div>
                    </div>
                    <div><Label>Department</Label><Input value={profile.department} onChange={(e) => setProfile({...profile, department: e.target.value})} /></div>
                    <div><Label>Role / Title</Label><Input value={profile.role} onChange={(e) => setProfile({...profile, role: e.target.value})} /></div>
                    <div className="flex justify-end">
                      <Button
                        disabled={saving}
                        onClick={async () => {
                          setSaving(true);
                          try {
                            await fetch(`${API_URL}/employees/persona`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                              body: JSON.stringify({
                                email: profile.email,
                                department: profile.department,
                                role: profile.role,
                              }),
                            });
                            useUIStore.getState().addNotification({
                              type: "success",
                              title: "Profile Updated",
                              message: "Your profile has been saved.",
                            });
                          } catch {
                            useUIStore.getState().addNotification({
                              type: "error",
                              title: "Save Failed",
                              message: "Could not save profile. Try again.",
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
