"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsList, TabsTrigger, TabsContent, Input, Label, Button } from "@/components/ui";
import { Bell, Shield, User, Palette, Save, ArrowLeft, Volume2, Mail, Smartphone } from "lucide-react";

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

  useEffect(() => {
    fetch(`${API_URL}/notification-preferences`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((data) => { if (data.preferences) setPrefs(data.preferences); })
      .catch(() => {})
      .finally(() => setLoading(false));
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
            <TabsTrigger value="security"><Shield className="w-4 h-4 mr-2" /> Security</TabsTrigger>
            <TabsTrigger value="appearance"><Palette className="w-4 h-4 mr-2" /> Appearance</TabsTrigger>
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
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Full Name</Label><Input defaultValue="User" /></div>
                  <div><Label>Email</Label><Input defaultValue="user@company.com" /></div>
                </div>
                <div><Label>Department</Label><Input defaultValue="Engineering" /></div>
                <div className="flex justify-end">
                  <Button className="cursor-pointer"><Save className="w-4 h-4 mr-2" /> Save Changes</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader><CardTitle>Security Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Current Password</Label><Input type="password" /></div>
                <div><Label>New Password</Label><Input type="password" /></div>
                <div className="flex justify-end">
                  <Button className="cursor-pointer">Update Password</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance">
            <Card>
              <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm">Dark Mode</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-9 h-5 bg-border rounded-full peer peer-checked:bg-primary transition-colors" />
                  </label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
