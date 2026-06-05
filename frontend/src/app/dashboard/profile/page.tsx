"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from "@/components/ui";
import {
  ArrowLeft,
  Building2,
  CheckCircle,
  Globe,
  Link2,
  Loader2,
  Save,
  Search,
  Sparkles,
  User as UserIcon,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface SocialLink {
  platform: string;
  key: string;
  url: string;
  detected: boolean;
  icon: React.ReactNode;
  placeholder: string;
}

const PLATFORM_LIST: { platform: string; key: string; placeholder: string }[] = [
  { platform: "LinkedIn", key: "linkedin", placeholder: "https://www.linkedin.com/company/your-co" },
  { platform: "Twitter / X", key: "twitter", placeholder: "https://twitter.com/your-handle" },
  { platform: "Instagram", key: "instagram", placeholder: "https://www.instagram.com/your-handle" },
  { platform: "Facebook", key: "facebook", placeholder: "https://www.facebook.com/your-page" },
  { platform: "YouTube", key: "youtube", placeholder: "https://www.youtube.com/@your-handle" },
];

function processDomain(input: string): string {
  let d = (input || "").trim().toLowerCase();
  d = d.replace("https://", "").replace("http://", "").replace("www.", "");
  return d.split("/")[0];
}

export default function ProfilePage() {
  const { user, role } = useAuth();
  const router = useRouter();
  const { organization, updateOrganization, detectSocialPresence } =
    useOrganizationStore();

  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(
    PLATFORM_LIST.map((p) => ({
      platform: p.platform,
      key: p.key,
      url: "",
      detected: false,
      icon: <Link2 className="w-5 h-5" />,
      placeholder: p.placeholder,
    }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFromOrg = useCallback(() => {
    if (!organization) return;
    const stored = (organization as unknown as { social_links?: Record<string, string> })
      .social_links;
    if (stored && typeof stored === "object") {
      setSocialLinks((prev) =>
        prev.map((s) => {
          const url = stored[s.key] || stored[s.key === "twitter" ? "x" : s.key] || "";
          return { ...s, url, detected: !!url };
        })
      );
    }
  }, [organization]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!organization) {
      setLoading(false);
      return;
    }
    loadFromOrg();
    setLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [organization, loadFromOrg]);

  const runAutoDetect = useCallback(async () => {
    if (!organization) return;
    const domain = processDomain(organization.domain || "");
    if (!domain) {
      setError("Add your company domain first to auto-detect social links.");
      return;
    }
    setError(null);
    setDetecting(true);
    try {
      const links = await detectSocialPresence(domain, organization.name || "");
      let didFill = false;
      setSocialLinks((prev) =>
        prev.map((s) => {
          const incoming = (links as Record<string, string | undefined>)[s.key] || "";
          if (incoming && !s.url) didFill = true;
          return {
            ...s,
            url: s.url || incoming,
            detected: !!(s.url || incoming),
          };
        })
      );
      if (didFill) setAutoFilled(true);
    } catch (err) {
      console.error("Auto-detect failed:", err);
      setError("Could not auto-detect social links. Please enter them manually.");
    } finally {
      setDetecting(false);
    }
  }, [organization, detectSocialPresence]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!organization) return;
    const stored = (organization as unknown as { social_links?: Record<string, string> })
      .social_links;
    const hasAny = stored && Object.values(stored).some((v) => !!v);
    if (!hasAny) {
      runAutoDetect();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization, runAutoDetect]);

  const updateLink = (index: number, url: string) => {
    setSocialLinks((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], url, detected: !!url };
      return updated;
    });
    setAutoFilled(false);
  };

  const handleSave = async () => {
    if (!organization?.id) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, string> = {};
      socialLinks.forEach((s) => {
        if (s.url && s.url.trim()) payload[s.key] = s.url.trim();
      });
      const res = await fetch(`${API_URL}/organizations/${organization.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ social_links: payload }),
      });
      if (!res.ok) throw new Error("Failed to save");
      updateOrganization({
        social_links: payload,
      } as unknown as Partial<typeof organization>);
      setLastSavedAt(new Date().toISOString());
    } catch (err) {
      console.error("Save failed:", err);
      setError("Could not save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const anyDetected = socialLinks.some((s) => s.url && s.detected);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!organization) {
    return (
      <DashboardLayout>
        <div className="max-w-xl mx-auto text-center py-12">
          <Building2 className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <h1 className="text-2xl font-bold mb-2">No organization yet</h1>
          <p className="text-text-muted mb-6">
            Complete onboarding to manage your organization profile.
          </p>
          <Button onClick={() => router.push("/onboarding/owner")}>
            Start onboarding
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
              Profile & Social Presence
            </h1>
            <p className="text-text-muted mt-1 text-sm">
              Keep your organization details and social links up to date
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-primary" />
                  <CardTitle>Account</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-muted">Signed in as</p>
                  <p className="font-medium break-all">
                    {user?.email || (user as unknown as { phone?: string })?.phone || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-muted">Role</p>
                  <p className="font-medium capitalize">{role || "—"}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  <CardTitle>Organization</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-muted">Name</p>
                  <p className="font-medium">{organization.name}</p>
                </div>
            {organization.domain && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-text-muted">Domain</p>
                    <p className="font-medium break-all">{organization.domain}</p>
                  </div>
                )}
                {organization.industry && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-text-muted">Industry</p>
                    <p className="font-medium">{organization.industry}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    <CardTitle>Social Presence</CardTitle>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runAutoDetect}
                    disabled={detecting}
                    className="cursor-pointer"
                  >
                    {detecting ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-1.5" />
                    )}
                    {detecting ? "Detecting..." : "Auto-detect"}
                  </Button>
                </div>
                <CardDescription>
                  {anyDetected
                    ? "We pre-filled the URLs we could detect. Add or edit the rest below."
                    : "We could not auto-detect social links from your website. Add any you'd like to connect."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {socialLinks.map((social, i) => (
                    <div
                      key={social.key}
                      className="rounded-xl border border-border bg-surface/40 p-3 flex items-center gap-3"
                    >
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          social.url ? "bg-primary/10" : "bg-surface"
                        }`}
                      >
                        <div className={social.url ? "text-primary" : "text-text-muted"}>
                          {social.icon}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{social.platform}</p>
                          {social.detected && social.url && (
                            <Badge variant="success" className="text-[10px]">
                              Auto-detected
                            </Badge>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder={social.placeholder}
                          value={social.url}
                          onChange={(e) => updateLink(i, e.target.value)}
                          className="w-full mt-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs focus:border-primary focus:outline-none"
                        />
                      </div>
                      {social.url && (
                        <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-between mt-5">
                  <div className="text-xs text-text-muted">
                    {lastSavedAt ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Saved
                      </span>
                    ) : autoFilled ? (
                      <span className="inline-flex items-center gap-1 text-text-muted">
                        <Sparkles className="w-3.5 h-3.5" />
                        Auto-filled values are highlighted; review and save.
                      </span>
                    ) : (
                      <span>Edits are saved when you press Save.</span>
                    )}
                  </div>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="cursor-pointer"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-1.5" />
                    )}
                    Save changes
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-primary" />
                  <CardTitle>Why connect social profiles?</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-text-muted">
                  <li>• YesBoss uses your public posts to keep your dashboard context fresh.</li>
                  <li>• Social signals power better AI suggestions for growth, marketing, and hiring.</li>
                  <li>• You can edit or remove links at any time from this page.</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
