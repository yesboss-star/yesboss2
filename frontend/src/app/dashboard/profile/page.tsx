"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  Mail,
  Smartphone,
  Key,
  Pencil,
  X,
  AlertCircle,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { signInWithPhoneNumber, RecaptchaVerifier } from "firebase/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

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

const DICEBEAR_STYLES = ["adventurer", "adventurer-neutral", "avataaars", "big-ears", "bottts", "fun-emoji", "icons", "initials", "lorelei", "micah", "miniavs", "notionists", "open-peeps", "personas", "pixel-art", "thumbs"];

const COUNTRY_CODES = [
  { code: "+91", country: "India" },
  { code: "+1", country: "US/Canada" },
  { code: "+44", country: "UK" },
  { code: "+61", country: "Australia" },
  { code: "+971", country: "UAE" },
  { code: "+65", country: "Singapore" },
];

function processDomain(input: string): string {
  let d = (input || "").trim().toLowerCase();
  d = d.replace("https://", "").replace("http://", "").replace("www.", "");
  return d.split("/")[0];
}

export default function ProfilePage() {
  const { user, role } = useAuth();
  const router = useRouter();
  const { organization, updateOrganization, detectSocialPresence } = useOrganizationStore();

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

  // Personal profile state
  const [profileData, setProfileData] = useState({
    avatarStyle: "adventurer",
    fullName: "",
    department: "",
    jobRole: "",
  });
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [personalCardError, setPersonalCardError] = useState<string | null>(null);

  // Phone OTP state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[1]);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const recaptchaVerifierRef = useRef<any>(null);
  const profilePhoneContainerRef = useRef<HTMLDivElement>(null);

  const userEmail = user?.email || "";

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

  // Load personal profile
  useEffect(() => {
    if (!userEmail) return;
    setProfileLoading(true);
    fetch(`${API_URL}/employees/me?email=${encodeURIComponent(userEmail)}`, {
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => r.json())
      .then((data) => {
        const emp = data.employee;
        if (emp) {
          setProfileData({
            avatarStyle: emp.avatar_style || "adventurer",
            fullName: emp.full_name || user?.displayName || "",
            department: emp.department || "",
            jobRole: emp.role || "",
          });
          setPhoneNumber(emp.phone || "");
          setPhoneVerified(!!emp.phone);
        } else {
          setProfileData((p) => ({ ...p, fullName: user?.displayName || "" }));
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [userEmail, user]);

  useEffect(() => {
    if (!organization) {
      setLoading(false);
      return;
    }
    loadFromOrg();
    setLoading(false);
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
    if (!organization) return;
    const stored = (organization as unknown as { social_links?: Record<string, string> })
      .social_links;
    const hasAny = stored && Object.values(stored).some((v) => !!v);
    if (!hasAny) {
      runAutoDetect();
    }
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

  const handleProfileSave = async () => {
    if (!userEmail) return;
    setProfileSaving(true);
    setPersonalCardError(null);
    try {
      const res = await fetch(`${API_URL}/employees/persona`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          organization_id: organization?.id,
          department: profileData.department || null,
          role: profileData.jobRole || null,
          avatar_style: profileData.avatarStyle,
        }),
      });
      if (!res.ok) throw new Error("Failed to save profile");
    } catch (err) {
      setPersonalCardError("Could not save your profile. Please try again.");
    } finally {
      setProfileSaving(false);
    }
  };

  // Phone OTP flow
  const ensureProfileRecaptcha = async (): Promise<boolean> => {
    if (recaptchaVerifierRef.current) return true;
    if (!profilePhoneContainerRef.current) return false;
    if (typeof window === "undefined") return false;

    if (!document.getElementById("google-recaptcha-js")) {
      const script = document.createElement("script");
      script.id = "google-recaptcha-js";
      script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    if (typeof (window as unknown as { grecaptcha?: unknown }).grecaptcha === "undefined") {
      await new Promise<void>((resolve) => {
        let waited = 0;
        const check = () => {
          if (typeof (window as unknown as { grecaptcha?: unknown }).grecaptcha !== "undefined") {
            resolve();
          } else if (waited < 5000) {
            waited += 100;
            setTimeout(check, 100);
          } else {
            resolve();
          }
        };
        check();
      });
    }

    recaptchaVerifierRef.current = new RecaptchaVerifier(auth, profilePhoneContainerRef.current, {
      size: "invisible",
      callback: () => {},
    });
    return true;
  };

  const sendPhoneOtp = async () => {
    const digits = phoneNumber.replace(/\D/g, "");
    if (!digits) { setOtpError("Enter a phone number"); return; }
    setOtpLoading(true);
    setOtpError(null);
    try {
      const ok = await ensureProfileRecaptcha();
      if (!ok) { setOtpError("Could not initialize reCAPTCHA. Try again."); setOtpLoading(false); return; }
      const formatted = `${selectedCountry.code}${digits}`;
      const result = await signInWithPhoneNumber(auth, formatted, recaptchaVerifierRef.current);
      setConfirmationResult(result);
      setOtpSent(true);
    } catch (err: any) {
      setOtpError(err.message || "Failed to send OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyPhoneOtp = async () => {
    if (!otpCode || otpCode.length < 6) { setOtpError("Enter the 6-digit code"); return; }
    setOtpLoading(true);
    setOtpError(null);
    try {
      await confirmationResult.confirm(otpCode);
      // OTP verified — now save phone to backend
      setPhoneSaving(true);
      const digits = phoneNumber.replace(/\D/g, "");
      const formatted = `${selectedCountry.code}${digits}`;
      const token = localStorage.getItem("yesboss_id_token");
      const res = await fetch(`${API_URL}/auth/me/phone`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: formatted, phone_verified: true }),
      });
      if (!res.ok) throw new Error("Failed to save phone");
      setPhoneVerified(true);
      setEditingPhone(false);
      setOtpSent(false);
      setOtpCode("");
    } catch (err: any) {
      setOtpError(err.message || "Verification failed");
    } finally {
      setOtpLoading(false);
      setPhoneSaving(false);
    }
  };

  const getAvatarUrl = (style: string, seed: string) => {
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
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
              Manage your personal profile and organization social links
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            {/* Personal Profile Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-primary" />
                  <CardTitle>Personal Profile</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {profileLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                ) : (
                  <div className="space-y-4">
                    {/* Avatar */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="relative">
                        <img
                          src={getAvatarUrl(profileData.avatarStyle, profileData.fullName || userEmail)}
                          alt="Avatar"
                          className="w-20 h-20 rounded-full bg-surface border-2 border-border object-cover"
                        />
                        <button
                          onClick={() => setShowStylePicker(!showStylePicker)}
                          className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-primary text-white cursor-pointer"
                          aria-label="Change avatar style"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {showStylePicker && (
                        <div className="w-full p-2 rounded-xl border border-border bg-surface">
                          <div className="grid grid-cols-4 gap-1 max-h-32 overflow-y-auto">
                            {DICEBEAR_STYLES.map((s) => (
                              <button
                                key={s}
                                onClick={() => { setProfileData((p) => ({ ...p, avatarStyle: s })); setShowStylePicker(false); }}
                                className={`p-1 rounded-lg text-[10px] text-center cursor-pointer hover:bg-primary/10 transition-colors ${profileData.avatarStyle === s ? "ring-2 ring-primary" : ""}`}
                              >
                                <img src={getAvatarUrl(s, profileData.fullName || userEmail)} alt={s} className="w-8 h-8 mx-auto" />
                                <span className="block truncate mt-0.5">{s}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Full Name */}
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-text-muted mb-1">Full Name</label>
                      <input
                        type="text"
                        value={profileData.fullName}
                        onChange={(e) => setProfileData((p) => ({ ...p, fullName: e.target.value }))}
                        placeholder="Your name"
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm focus:border-primary focus:outline-none"
                      />
                    </div>

                    {/* Email (read-only) */}
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-text-muted mb-1">Email</label>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface/50 border border-border text-sm text-text-muted">
                        <Mail className="w-4 h-4" />
                        <span className="truncate">{userEmail || "—"}</span>
                      </div>
                    </div>

                    {/* Department */}
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-text-muted mb-1">Department</label>
                      <input
                        type="text"
                        value={profileData.department}
                        onChange={(e) => setProfileData((p) => ({ ...p, department: e.target.value }))}
                        placeholder="e.g. Engineering, Marketing"
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm focus:border-primary focus:outline-none"
                      />
                    </div>

                    {/* Role / Title */}
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-text-muted mb-1">Role / Title</label>
                      <input
                        type="text"
                        value={profileData.jobRole}
                        onChange={(e) => setProfileData((p) => ({ ...p, jobRole: e.target.value }))}
                        placeholder="e.g. CEO, Developer"
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm focus:border-primary focus:outline-none"
                      />
                    </div>

                    {/* Phone with OTP */}
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-text-muted mb-1">Phone</label>
                      {editingPhone ? (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <select
                              value={selectedCountry.code}
                              onChange={(e) => setSelectedCountry(COUNTRY_CODES.find((c) => c.code === e.target.value) || COUNTRY_CODES[1])}
                              className="px-2 py-2 rounded-lg bg-surface border border-border text-xs"
                            >
                              {COUNTRY_CODES.map((c) => (
                                <option key={c.code} value={c.code}>{c.code}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={phoneNumber}
                              onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                              placeholder="Phone number"
                              className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border text-sm focus:border-primary focus:outline-none"
                              disabled={otpSent}
                            />
                          </div>
                          <div ref={profilePhoneContainerRef} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }} />
                          {otpError && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                              <span className="text-xs text-rose-300">{otpError}</span>
                            </div>
                          )}
                          {otpSent ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="Enter 6-digit OTP"
                                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm focus:border-primary focus:outline-none text-center tracking-widest"
                              />
                              <div className="flex gap-2">
                                <Button
                                  onClick={verifyPhoneOtp}
                                  disabled={otpLoading || otpCode.length < 6}
                                  size="sm"
                                  className="flex-1 cursor-pointer"
                                >
                                  {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => { setOtpSent(false); setOtpCode(""); setOtpError(null); }}
                                  className="cursor-pointer"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              onClick={sendPhoneOtp}
                              disabled={otpLoading || !phoneNumber.replace(/\D/g, "")}
                              size="sm"
                              className="w-full cursor-pointer"
                            >
                              {otpLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Key className="w-4 h-4 mr-1" />}
                              Send OTP
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface/50 border border-border text-sm">
                          <div className="flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-text-muted" />
                            <span>{phoneNumber ? `${phoneNumber}` : "—"}</span>
                            {phoneVerified && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                          </div>
                          <button
                            onClick={() => setEditingPhone(true)}
                            className="text-primary hover:underline text-xs cursor-pointer"
                          >
                            {phoneNumber ? "Change" : "Add"}
                          </button>
                        </div>
                      )}
                    </div>

                    {personalCardError && (
                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                        {personalCardError}
                      </div>
                    )}

                    <Button
                      onClick={handleProfileSave}
                      disabled={profileSaving || editingPhone}
                      className="w-full cursor-pointer"
                    >
                      {profileSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                      Save Changes
                    </Button>
                  </div>
                )}
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
            {role === "owner" && (
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
            )}

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
