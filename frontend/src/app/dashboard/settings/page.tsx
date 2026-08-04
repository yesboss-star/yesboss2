"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsList, TabsTrigger, TabsContent, Button } from "@/components/ui";
import { Bell, ArrowLeft, Volume2, Mail, Smartphone, Plug, MessageSquare } from "lucide-react";
import ZohoConnectButton from "@/components/owners/ZohoConnectButton";
import GoogleConnectButton from "@/components/owners/GoogleConnectButton";
import { useZohoStore } from "@/stores/zohoStore";
import { useGoogleStore } from "@/stores/googleStore";
import { useUIStore } from "@/stores/uiStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

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

  useEffect(() => {
    const headers = getAuthHeaders();
    fetch(`${API_URL}/notification-preferences`, { headers })
      .then((r) => r.json())
      .then((data) => {
        if (data.preferences) setPrefs(data.preferences);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
    if (params.get("google") === "connected") {
      const url = new URL(window.location.href);
      url.searchParams.delete("google");
      window.history.replaceState({}, "", url.toString());
      useGoogleStore.getState().checkStatus();
      if (window.opener && window.opener !== window) {
        window.close();
      } else {
        useUIStore.getState().addNotification({
          type: "success",
          title: "Google Connected",
          message: "Your Google account has been connected successfully.",
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
          <button onClick={() => router.push("/dashboard")} className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-text-muted mt-1">Manage your preferences</p>
          </div>
        </div>

        <Tabs defaultValue="notifications">
          <TabsList className="mb-4">
            <TabsTrigger value="notifications"><Bell className="w-4 h-4 mr-2" /> Notifications</TabsTrigger>
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
              </div>
            )}
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
                      Your calendar is read to help the AI schedule and recommend
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle><Plug className="w-4 h-4 inline mr-2" /> Google Integration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Gmail, Google Tasks & Calendar</p>
                    <p className="text-xs text-text-muted mt-1">
                      Prefer Google? Connect your Gmail to sync tasks to Google Tasks and use your Google Calendar.
                    </p>
                  </div>
                  <GoogleConnectButton />
                </div>
                <div className="p-3 rounded-xl bg-surface border border-border/50">
                  <h4 className="text-xs font-medium text-text-muted mb-2">What gets connected?</h4>
                  <ul className="space-y-1 text-xs text-text-muted">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">&bull;</span>
                      Tasks created in yesboss appear in your Google Tasks (YesBoss list)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">&bull;</span>
                      Completing a task in Google Tasks syncs the status back
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">&bull;</span>
                      Your Google Calendar is read to help the AI schedule and recommend
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">&bull;</span>
                      Only one provider can be active — connecting Google disconnects Zoho
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
              <CardContent>
                <p className="text-sm text-text-muted mb-4">
                  We'd love to hear from you! Send us your feedback via email.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => window.open("mailto:support@yesboss.app?subject=Feedback", "_blank")}
                    className="cursor-pointer"
                  >
                    <Mail className="w-4 h-4 mr-2" /> Gmail
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open("mailto:support@yesboss.app?subject=Feedback", "_blank")}
                    className="cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" /> Outlook
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
