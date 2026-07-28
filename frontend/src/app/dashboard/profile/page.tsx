"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useUIStore } from "@/stores/uiStore";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Input, Label } from "@/components/ui";
import { Avatar, DICEBEAR_STYLES } from "@/components/ui/Avatar";
import {
  ArrowLeft, Building2, CheckCircle, Globe, Link2, Loader2, Save, Search, Sparkles,
  User as UserIcon, Mail, Camera, RefreshCw, Phone, Users,
  Smartphone, Key, X, AlertCircle, ChevronDown,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { ConfirmationResult } from "firebase/auth";
import { initRecaptcha, sendLinkOtp, resetRecaptcha } from "@/lib/phoneAuth";

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

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("yesboss_id_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export default function ProfilePage() {
  const { user, role } = useAuth();
  const router = useRouter();
  const { organization, updateOrganization, detectSocialPresence } = useOrganizationStore();

  // ---- Social presence state ----
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
  const [socialSaving, setSocialSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socialExpanded, setSocialExpanded] = useState(false);

  // ---- Profile info state ----
  const [profile, setProfile] = useState({ fullName: "", email: "", department: "", role: "" });
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const storeAvatarStyle = useOrganizationStore((s) => s.avatarStyle);
  const [dicebearStyle, setDicebearStyle] = useState(storeAvatarStyle || "lorelei");
  const [showStylePicker, setShowStylePicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Phone OTP state (links to current Firebase user) ----
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(COUNTRY_CODES[0]);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpVerified, setPhoneOtpVerified] = useState(false);
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [phoneOtpError, setPhoneOtpError] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneResendTimer, setPhoneResendTimer] = useState(0);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<any>(null);

  const userEmail = user?.email || "";
  const anyDetected = socialLinks.some((s) => s.url && s.detected);

  // ---- Load social links ----
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
    if (!organization) { setLoading(false); return; }
    loadFromOrg();
    setLoading(false);
  }, [organization, loadFromOrg]);

  // ---- Load profile + phone ----
  useEffect(() => {
    const stored = localStorage.getItem("yesboss_user");
    let userName = "", userEmailLocal = "";
    if (stored) {
      try {
        const u = JSON.parse(stored);
        userName = u?.full_name || u?.displayName || "";
        userEmailLocal = u?.email || "";
      } catch {}
    }
    setProfile((p) => ({ ...p, fullName: userName, email: userEmailLocal }));

    if (!userEmailLocal) { setProfileLoading(false); return; }
    setProfileLoading(true);

    Promise.all([
      fetch(`${API_URL}/employees/by-email/${encodeURIComponent(userEmailLocal)}`, { headers: getAuthHeaders() })
        .then((r) => r.json()).catch(() => ({})),
      fetch(`${API_URL}/auth/me`, { headers: getAuthHeaders() })
        .then((r) => r.json()).catch(() => ({})),
    ]).then(([empData, meData]) => {
      const emp = empData.employee || {};
      const me = meData.user || {};

      if (emp) {
        setProfile({
          fullName: emp.full_name || userName || "",
          email: emp.email || userEmailLocal || "",
          department: emp.department || "",
          role: emp.role || "",
        });
        if (emp.avatar_style) setDicebearStyle(emp.avatar_style);
        setProfileError(false);
      }

      if (me.phone && me.phone_verified) {
        setPhoneNumber(me.phone.replace(/\D/g, ""));
        setPhoneSaved(true);
        const matched = COUNTRY_CODES.find((c) => me.phone.startsWith(c.code));
        if (matched) setPhoneCountry(matched);
        try {
          const storedLocal = localStorage.getItem("yesboss_user");
          if (storedLocal) {
            const updated = JSON.parse(storedLocal);
            updated.phone = me.phone;
            updated.phone_verified = true;
            localStorage.setItem("yesboss_user", JSON.stringify(updated));
          }
        } catch {}
      } else {
        try {
          const storedLocal = localStorage.getItem("yesboss_user");
          if (storedLocal) {
            const cached = JSON.parse(storedLocal);
            if (cached.phone && cached.phone_verified) {
              setPhoneNumber(cached.phone.replace(/\D/g, ""));
              setPhoneSaved(true);
              const cachedMatched = COUNTRY_CODES.find((c) => cached.phone.startsWith(c.code));
              if (cachedMatched) setPhoneCountry(cachedMatched);
            }
          }
        } catch {}
      }

      if (userEmailLocal) {
        const avatarApiUrl = `${API_URL}/employees/avatar/${encodeURIComponent(userEmailLocal)}?t=${Date.now()}`;
        fetch(avatarApiUrl, { method: "HEAD" })
          .then((r) => { if (r.ok) { setAvatarUrl(avatarApiUrl); useOrganizationStore.getState().setAvatarUrl(avatarApiUrl); } })
          .catch(() => {});
      }
    }).catch(() => {
      setProfileError(true);
    }).finally(() => {
      setProfileLoading(false);
    });
  }, [user?.uid]);

  // ---- Auto-detect social links ----
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
          return { ...s, url: s.url || incoming, detected: !!(s.url || incoming) };
        })
      );
      if (didFill) setAutoFilled(true);
    } catch (err) {
      setError("Could not auto-detect social links. Please enter them manually.");
    } finally {
      setDetecting(false);
    }
  }, [organization, detectSocialPresence]);

  useEffect(() => {
    if (!organization) return;
    const stored = (organization as unknown as { social_links?: Record<string, string> }).social_links;
    const hasAny = stored && Object.values(stored).some((v) => !!v);
    if (!hasAny) runAutoDetect();
  }, [organization, runAutoDetect]);

  // ---- Social link handlers ----
  const updateLink = (index: number, url: string) => {
    setSocialLinks((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], url, detected: !!url };
      return updated;
    });
    setAutoFilled(false);
  };

  const handleSocialSave = async () => {
    if (!organization?.id) return;
    setSocialSaving(true);
    setError(null);
    try {
      const payload: Record<string, string> = {};
      socialLinks.forEach((s) => { if (s.url && s.url.trim()) payload[s.key] = s.url.trim(); });
      const res = await fetch(`${API_URL}/organizations/${organization.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ social_links: payload }),
      });
      if (!res.ok) throw new Error("Failed to save");
      updateOrganization({ social_links: payload } as unknown as Partial<typeof organization>);
      setLastSavedAt(new Date().toISOString());
    } catch {
      setError("Could not save your changes. Please try again.");
    } finally {
      setSocialSaving(false);
    }
  };

  // ---- Avatar handlers ----
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
        const url = `${API_URL}${data.avatar_url}?t=${Date.now()}`;
        setAvatarUrl(url);
        useOrganizationStore.getState().setAvatarUrl(url);
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
    useOrganizationStore.getState().setAvatarUrl(undefined);
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

  // ---- Profile save ----
  const handleProfileSave = async () => {
    setProfileSaving(true);
    try {
      const res = await fetch(`${API_URL}/employees/persona`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          email: profile.email,
          full_name: profile.fullName,
          department: profile.department,
          role: profile.role,
          avatar_style: dicebearStyle,
        }),
      });
      if (res.ok) {
        useOrganizationStore.getState().setAvatarStyle(dicebearStyle);
        const storedUser = localStorage.getItem("yesboss_user");
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          userData.full_name = profile.fullName;
          if (role !== "owner") userData.role = profile.role;
          localStorage.setItem("yesboss_user", JSON.stringify(userData));
          const userCookie = encodeURIComponent(JSON.stringify(userData));
          document.cookie = `yesboss_user=${userCookie}; path=/; max-age=86400; SameSite=Lax`;
        }
        useUIStore.getState().addNotification({ type: "success", title: "Profile Updated", message: "Your profile has been saved." });
      } else {
        throw new Error("Save failed");
      }
    } catch {
      useUIStore.getState().addNotification({ type: "error", title: "Save Failed", message: "Could not save profile. Try again." });
    } finally {
      setProfileSaving(false);
    }
  };

  // ---- Phone OTP flow (links to current Firebase user) ----
  useEffect(() => {
    if (phoneResendTimer > 0) {
      const timer = setTimeout(() => setPhoneResendTimer(phoneResendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [phoneResendTimer]);

  useEffect(() => {
    return () => resetRecaptcha(recaptchaVerifierRef);
  }, []);

  useEffect(() => {
    const syncPhone = async () => {
      try {
        const t = localStorage.getItem("yesboss_id_token");
        if (!t) return;
        const res = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
        if (!res.ok) return;
        const data = await res.json();
        const me = data.user || {};
        if (me.phone && me.phone_verified) {
          setPhoneNumber(me.phone.replace(/\D/g, ""));
          setPhoneSaved(true);
          const matched = COUNTRY_CODES.find((c) => me.phone.startsWith(c.code));
          if (matched) setPhoneCountry(matched);
          try {
            const storedLocal = localStorage.getItem("yesboss_user");
            if (storedLocal) {
              const updated = JSON.parse(storedLocal);
              updated.phone = me.phone;
              updated.phone_verified = true;
              localStorage.setItem("yesboss_user", JSON.stringify(updated));
            }
          } catch {}
        }
      } catch {}
    };
    const onVisibility = () => { if (document.visibilityState === "visible") syncPhone(); };
    const onFocus = () => syncPhone();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const sendPhoneOtp = async () => {
    const digitsOnly = phoneNumber.replace(/\D/g, "");
    if (digitsOnly.length < 6) { setPhoneOtpError("Enter a valid phone number"); return; }
    if (!auth.currentUser) { setPhoneOtpError("You must be logged in to verify a phone."); return; }
    setPhoneOtpLoading(true);
    setPhoneOtpError("");
    try {
      resetRecaptcha(recaptchaVerifierRef);
      const verifier = await initRecaptcha(auth, "recaptcha-container-profile");
      if (!verifier) {
        setPhoneOtpError("reCAPTCHA is loading. Please try again.");
        setPhoneOtpLoading(false);
        return;
      }
      recaptchaVerifierRef.current = verifier;
      const formattedPhone = `${phoneCountry.code}${digitsOnly}`;
      const result = await sendLinkOtp(auth, formattedPhone, verifier);
      setConfirmationResult(result);
      setPhoneOtpSent(true);
      setPhoneResendTimer(60);
    } catch (err: any) {
      if (err.code === "auth/invalid-phone-number") setPhoneOtpError("Invalid phone number for selected country");
      else if (err.code === "auth/too-many-requests") setPhoneOtpError("Too many attempts. Try later");
      else setPhoneOtpError(err.message || "Failed to send OTP");
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  const savePhoneToBackend = async () => {
    setPhoneOtpLoading(true);
    setPhoneOtpError("");
    try {
      const storedUser = localStorage.getItem("yesboss_user");
      const userData = storedUser ? JSON.parse(storedUser) : {};
      const uid = userData.uid || auth.currentUser?.uid || "";
      const formattedPhone = `${phoneCountry.code}${phoneNumber.replace(/\D/g, "")}`;

      const res = await fetch(`${API_URL}/auth/update-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ uid, phone: formattedPhone }),
      });
      if (res.ok) {
        setPhoneSaved(true);
        if (storedUser) {
          const updated = JSON.parse(storedUser);
          updated.phone = formattedPhone;
          updated.phone_verified = true;
          localStorage.setItem("yesboss_user", JSON.stringify(updated));
          const userCookie = encodeURIComponent(JSON.stringify(updated));
          document.cookie = `yesboss_user=${userCookie}; path=/; max-age=86400; SameSite=Lax`;
        }
        useUIStore.getState().addNotification({
          type: "success", title: "Phone Verified", message: "Your phone number has been verified and linked to your account.",
        });
      } else {
        const errBody = await res.text().catch(() => "");
        throw new Error(`Save failed (HTTP ${res.status}${errBody ? `: ${errBody}` : ""})`);
      }
    } catch (err: any) {
      setPhoneOtpError(err.message || "Verified, but saving failed. Tap Retry Save.");
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  const verifyPhoneOtp = async () => {
    if (!phoneOtp || phoneOtp.length < 6) { setPhoneOtpError("Enter the 6-digit OTP"); return; }
    if (!confirmationResult) { setPhoneOtpError("Session expired. Tap resend."); return; }
    setPhoneOtpLoading(true);
    setPhoneOtpError("");
    try {
      await confirmationResult.confirm(phoneOtp);
      setPhoneOtpVerified(true);
    } catch (err: any) {
      setPhoneOtpVerified(false);
      setPhoneOtpLoading(false);
      if (err.code === "auth/invalid-verification-code") setPhoneOtpError("Invalid OTP");
      else if (err.code === "auth/credential-already-in-use") setPhoneOtpError("This phone is already linked to another account");
      else setPhoneOtpError(err.message || "Verification failed");
      return;
    }
    await savePhoneToBackend();
  };

  // ---- Render ----
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
          <p className="text-text-muted mb-6">Complete onboarding to manage your organization profile.</p>
          <Button onClick={() => router.push("/onboarding/owner")}>Start onboarding</Button>
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
            <p className="text-text-muted mt-1 text-sm">Manage your personal profile and organization social links</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ---- Left column ---- */}
          <div className="lg:col-span-1 space-y-6">
            {/* Profile Information Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserIcon className="w-5 h-5 text-primary" />
                    <CardTitle>Profile Information</CardTitle>
                  </div>
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
                      <div>
                        <Label>Full Name</Label>
                        <Input
                          value={profile.fullName}
                          placeholder={profile.email.split("@")[0]}
                          onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input
                          value={profile.email}
                          onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Department</Label>
                        {role === "owner" ? (
                          <Input value="" placeholder="Owner — no department" disabled />
                        ) : (
                          <Input
                            value={profile.department}
                            placeholder="e.g. Engineering"
                            onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                          />
                        )}
                      </div>
                      <div>
                        <Label>Role / Title</Label>
                        {role === "owner" ? (
                          <Input value="Owner" disabled />
                        ) : (
                          <Input
                            value={profile.role}
                            placeholder="e.g. Software Engineer"
                            onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end pt-2 border-t border-border/50">
                      <Button
                        disabled={profileSaving}
                        onClick={handleProfileSave}
                        className="cursor-pointer"
                      >
                        <Save className="w-4 h-4 mr-2" /> {profileSaving ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Phone Verification Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Phone className="w-5 h-5 text-primary" />
                  <CardTitle>Phone Verification</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {phoneSaved ? (
                  <div className="flex items-center gap-2 text-emerald-400 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm">Phone verified: {phoneCountry.code} {phoneNumber.replace(/\D/g, "")}</span>
                  </div>
                ) : phoneOtpVerified ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle className="w-5 h-5" />
                      <span className="text-sm">{phoneOtpError ? "OTP verified — saving failed" : "OTP verified — saving..."}</span>
                    </div>
                    {phoneOtpError && (
                      <>
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                          <span className="text-xs text-rose-300">{phoneOtpError}</span>
                        </div>
                        <Button onClick={savePhoneToBackend} disabled={phoneOtpLoading} className="w-full cursor-pointer">
                          {phoneOtpLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : "Retry Save"}
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-text-muted mb-4">
                      Add and verify your phone number. It will be linked to your current account.
                    </p>
                    <div id="recaptcha-container-profile" style={{ position: "absolute", left: "-9999px", top: "auto", width: 1, height: 1, overflow: "hidden" }} />
                    <div className="flex gap-2 mb-3">
                      <select
                        value={phoneCountry.code}
                        onChange={(e) => setPhoneCountry(COUNTRY_CODES.find((c) => c.code === e.target.value) || COUNTRY_CODES[0])}
                        className="px-3 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm cursor-pointer"
                      >
                        {COUNTRY_CODES.map((c) => (
                          <option key={c.code} value={c.code}>{c.code}</option>
                        ))}
                      </select>
                      <div className="relative flex-1">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => { setPhoneNumber(e.target.value); setPhoneOtpError(""); }}
                          placeholder="555 000 0000"
                          disabled={phoneOtpSent}
                          className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm disabled:opacity-50"
                        />
                      </div>
                    </div>
                    {phoneOtpError && (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 mb-3">
                        <span className="text-xs text-rose-300">{phoneOtpError}</span>
                      </div>
                    )}
                    {!phoneOtpSent ? (
                      <Button
                        onClick={sendPhoneOtp}
                        disabled={phoneOtpLoading || phoneNumber.replace(/\D/g, "").length < 6}
                        className="w-full cursor-pointer"
                      >
                        {phoneOtpLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : "Send OTP"}
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium mb-2">Enter OTP</label>
                          <input
                            type="text"
                            value={phoneOtp}
                            onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="6-digit code"
                            className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                          />
                          <div className="mt-2 text-sm text-text-muted text-right">
                            {phoneResendTimer > 0 ? `Resend in ${phoneResendTimer}s` : (
                              <button onClick={sendPhoneOtp} className="text-primary hover:underline cursor-pointer">Resend OTP</button>
                            )}
                          </div>
                        </div>
                        <Button
                          onClick={verifyPhoneOtp}
                          disabled={phoneOtpLoading || phoneOtp.length < 6}
                          className="w-full cursor-pointer"
                        >
                          {phoneOtpLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : "Verify OTP"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Organization Info Card */}
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

          {/* ---- Right column ---- */}
          <div className="lg:col-span-2 space-y-6">
            {role === "owner" && (
              <Card>
                <CardHeader
                  onClick={() => setSocialExpanded(!socialExpanded)}
                  className="cursor-pointer select-none"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        className={`w-5 h-5 text-primary transition-transform duration-200 ${
                          socialExpanded ? "" : "-rotate-90"
                        }`}
                      />
                      <CardTitle>Social Presence</CardTitle>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); runAutoDetect(); }}
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
                  {socialExpanded && (
                    <CardDescription>
                      {anyDetected
                        ? "We pre-filled the URLs we could detect. Add or edit the rest below."
                        : "We could not auto-detect social links from your website. Add any you'd like to connect."}
                    </CardDescription>
                  )}
                </CardHeader>
                {socialExpanded && <CardContent>
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
                              <Badge variant="success" className="text-[10px]">Auto-detected</Badge>
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
                    <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>
                  )}

                  <div className="flex items-center justify-between mt-5">
                    <div className="text-xs text-text-muted">
                      {lastSavedAt ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <CheckCircle className="w-3.5 h-3.5" /> Saved
                        </span>
                      ) : autoFilled ? (
                        <span className="inline-flex items-center gap-1 text-text-muted">
                          <Sparkles className="w-3.5 h-3.5" /> Auto-filled values are highlighted; review and save.
                        </span>
                      ) : (
                        <span>Edits are saved when you press Save.</span>
                      )}
                    </div>
                    <Button
                      onClick={handleSocialSave}
                      disabled={socialSaving}
                      className="cursor-pointer"
                    >
                      {socialSaving ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-1.5" />
                      )}
                      Save changes
                    </Button>
                  </div>
                </CardContent>}
              </Card>
            )}

            {/* Organization Owners Card */}
            <Card>
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
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// ---- OwnerList component (moved from settings) ----
interface Owner {
  uid: string;
  email: string;
  full_name: string;
  role: "primary_owner" | "co_owner";
}

const OWNER_CACHE_KEY = "yesboss_owner_cache";

function OwnerList() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

    const cached = sessionStorage.getItem(OWNER_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.orgId === organization.id && Date.now() - parsed.timestamp < 30000) {
          setOwners(parsed.owners || []);
          setLoading(false);
          return;
        }
      } catch {}
    }

    setLoading(true);
    setError("");
    fetch(`${API_URL}/organizations/${organization.id}/owners`, {
      headers: getAuthHeaders(),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        const data = await r.json();
        const ownerList = data.owners || [];
        setOwners(ownerList);
        sessionStorage.setItem(OWNER_CACHE_KEY, JSON.stringify({ orgId: organization.id, timestamp: Date.now(), owners: ownerList }));
      })
      .catch((err) => {
        setError(err.message || "Failed to load owners");
      })
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
    return <p className="text-sm text-text-muted text-center py-4">No organization found.</p>;
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-rose-400 mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="cursor-pointer">
          <RefreshCw className="w-4 h-4 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  if (owners.length === 0) {
    return <p className="text-sm text-text-muted text-center py-4">No owners found.</p>;
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
            <Badge variant={owner.role === "primary_owner" ? "success" : "secondary"}>
              {owner.role === "primary_owner" ? "Primary Owner" : "Co-owner"}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
