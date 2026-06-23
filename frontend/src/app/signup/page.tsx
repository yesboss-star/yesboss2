"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, User, Mail, Lock, Phone, Shield, CheckCircle, AlertCircle, Loader2, MessageSquare, X, ArrowRight } from "lucide-react";
import { auth, RECAPTCHA_SITE_KEY } from "@/lib/firebase";
import { createUserWithEmailAndPassword, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult, ApplicationVerifier } from "firebase/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type UserRole = "owner" | "employee";

const COUNTRY_CODES = [
  { code: "+91", country: "India" },
  { code: "+1", country: "US/Canada" },
  { code: "+44", country: "UK" },
  { code: "+61", country: "Australia" },
  { code: "+971", country: "UAE" },
  { code: "+65", country: "Singapore" },
];

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_RE = /^\+?\d{6,15}$/;

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>("owner");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // OTP modal state
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const recaptchaVerifierRef = useRef<ApplicationVerifier | null>(null);
  const recaptchaInitPromiseRef = useRef<Promise<void> | null>(null);

  const [formData, setFormData] = useState({
    fullName: "",
    contact: "",
    otp: "",
    password: "",
    confirmPassword: "",
  });

  // Detect whether the user typed an email or a phone number
  const contactKind: "email" | "phone" | "unknown" = (() => {
    const v = formData.contact.trim();
    if (!v) return "unknown";
    if (v.includes("@")) return EMAIL_RE.test(v) ? "email" : "unknown";
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 6) return "phone";
    return "unknown";
  })();

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  useEffect(() => {
    if (!otpModalOpen || otpVerified) return;
    if (typeof window === "undefined") return;
    if (contactKind !== "phone") return;

    if (recaptchaInitPromiseRef.current) return;

    const loadScript = () => {
      if (document.getElementById("google-recaptcha-js")) return;
      const script = document.createElement("script");
      script.id = "google-recaptcha-js";
      script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    };

    const initRecaptcha = async (): Promise<void> => {
      loadScript();
      try {
        if (typeof (window as unknown as { grecaptcha?: unknown }).grecaptcha === "undefined") {
          await new Promise<void>((resolve) => {
            const check = () => {
              if (typeof (window as unknown as { grecaptcha?: unknown }).grecaptcha !== "undefined") {
                resolve();
              } else {
                setTimeout(check, 100);
              }
            };
            check();
            setTimeout(() => resolve(), 3000);
          });
        }
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, "recaptcha-container-modal", {
          siteKey: RECAPTCHA_SITE_KEY,
          size: "invisible",
          callback: () => {},
        });
        setRecaptchaReady(true);
      } catch (err) {
        console.error("Recaptcha init error:", err);
        setRecaptchaReady(false);
      }
    };

    const promise = initRecaptcha();
    recaptchaInitPromiseRef.current = promise;
    promise.catch(() => {});

    return () => {
      const verifier = recaptchaVerifierRef.current as (ApplicationVerifier & { clear?: () => void }) | null;
      try {
        verifier?.clear?.();
      } catch {}
      recaptchaVerifierRef.current = null;
      recaptchaInitPromiseRef.current = null;
      setRecaptchaReady(false);
    };
  }, [otpModalOpen, otpVerified, contactKind]);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const canSubmit = () => {
    if (!formData.fullName.trim()) return false;
    if (contactKind === "unknown") return false;
    if (formData.password.length < 6) return false;
    if (formData.password !== formData.confirmPassword) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit()) {
      setError("Please complete all fields correctly");
      return;
    }
    setOtpModalOpen(true);
    setOtpError("");
    // For email, send OTP immediately. For phone, wait for user to press "Send OTP" in modal.
    if (contactKind === "email") {
      await sendOtpToBackend();
    }
  };

  const sendOtpToBackend = async () => {
    setOtpLoading(true);
    setOtpError("");
    try {
      const body = contactKind === "email"
        ? { email: formData.contact.trim() }
        : { phone: `${selectedCountry.code}${formData.contact.replace(/\D/g, "")}` };
      const res = await fetch(`${API_URL}/auth/forgot-password/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Could not send OTP");
      }
      setOtpSent(true);
      setResendTimer(60);
      // For dev: pre-fill the OTP from the debug_otp returned by the backend
      if (data.debug_otp) {
        setFormData((p) => ({ ...p, otp: data.debug_otp }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send OTP";
      setOtpError(msg);
    } finally {
      setOtpLoading(false);
    }
  };

  const waitForRecaptcha = async (timeoutMs = 5000): Promise<ApplicationVerifier | null> => {
    if (recaptchaVerifierRef.current) return recaptchaVerifierRef.current;
    if (recaptchaInitPromiseRef.current) {
      await recaptchaInitPromiseRef.current;
    }
    const start = Date.now();
    while (!recaptchaVerifierRef.current && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return recaptchaVerifierRef.current;
  };

  const sendPhoneOtp = async () => {
    setOtpLoading(true);
    setOtpError("");
    try {
      const digitsOnly = formData.contact.replace(/\D/g, "");
      const formattedPhone = `${selectedCountry.code}${digitsOnly}`;
      if (!digitsOnly) {
        setOtpError("Please enter a valid phone number");
        setOtpLoading(false);
        return;
      }
      const appVerifier = await waitForRecaptcha();
      if (!appVerifier) {
        setOtpError("reCAPTCHA is still loading. Please try again in a moment.");
        setOtpLoading(false);
        return;
      }
      const result = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(result);
      setOtpSent(true);
      setResendTimer(60);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error("OTP Error:", err);
      if (err.code === "auth/invalid-phone-number") {
        setOtpError("Invalid phone number for selected country");
      } else if (err.code === "auth/too-many-requests") {
        setOtpError("Too many attempts. Try later");
      } else if (err.code === "auth/requires-android-redirect") {
        setOtpError("Please use a desktop browser for phone verification");
      } else {
        setOtpError(err.message || "Failed to send OTP");
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!formData.otp || formData.otp.length < 6) {
      setOtpError("Enter the 6-digit OTP");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      if (contactKind === "phone" && confirmationResult) {
        await confirmationResult.confirm(formData.otp);
        setOtpVerified(true);
        return;
      }
      // Email flow: call backend verify-otp
      const body = contactKind === "email"
        ? { email: formData.contact.trim(), otp: formData.otp }
        : { phone: `${selectedCountry.code}${formData.contact.replace(/\D/g, "")}`, otp: formData.otp };
      const res = await fetch(`${API_URL}/auth/forgot-password/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.message || "Invalid OTP");
      }
      setOtpVerified(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      setOtpError(msg);
    } finally {
      setOtpLoading(false);
    }
  };

  const finalizeSignup = async () => {
    if (contactKind !== "phone" && !otpVerified) {
      setOtpError("Please verify the OTP first");
      return;
    }
    setLoading(true);
    setError("");
    setOtpError("");
    try {
      let firebaseUid = "";
      if (contactKind === "email") {
        const credential = await createUserWithEmailAndPassword(auth, formData.contact.trim(), formData.password);
        firebaseUid = credential.user.uid;
      } else {
        firebaseUid = auth.currentUser?.uid || "";
      }

      const userData = {
        uid: firebaseUid,
        email: contactKind === "email" ? formData.contact.trim() : `${selectedCountry.code}${formData.contact.replace(/\D/g, "")}@phone.yesboss.app`,
        full_name: formData.fullName,
        phone: contactKind === "phone" ? `${selectedCountry.code}${formData.contact.replace(/\D/g, "")}` : "",
        role,
        phone_verified: contactKind === "phone",
        email_verified: contactKind === "email",
      };

      const syncRes = await fetch(`${API_URL}/auth/sync-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });
      if (!syncRes.ok) {
        const syncData = await syncRes.json().catch(() => ({}));
        throw new Error(syncData.detail || syncData.message || "Failed to sync account");
      }

      localStorage.setItem("yesboss_user", JSON.stringify(userData));
      localStorage.setItem("yesboss_role", role);
      const userCookie = encodeURIComponent(JSON.stringify(userData));
      document.cookie = `yesboss_token=true; path=/; max-age=86400; SameSite=Lax`;
      document.cookie = `yesboss_user=${userCookie}; path=/; max-age=86400; SameSite=Lax`;

      const dest = role === "owner"
        ? `/onboarding/owner?email=${encodeURIComponent(userData.email)}&name=${encodeURIComponent(formData.fullName)}`
        : `/onboarding/employee?email=${encodeURIComponent(userData.email)}&name=${encodeURIComponent(formData.fullName)}`;
      router.push(dest);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err?.code === "auth/email-already-in-use") {
        setOtpError("Email already registered. Try logging in.");
      } else if (err?.code === "auth/weak-password") {
        setOtpError("Password too weak");
      } else {
        setOtpError(err?.message || "Signup failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative bg-surface overflow-hidden">
        <div className="hero-glow top-1/4 left-1/4 animate-pulse-glow" />
        <div className="hero-glow bottom-1/4 right-1/4 animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="flex items-center gap-2 mb-8">
            <img src="/yesboss-logo.svg" alt="YesBoss" className="w-10 h-10" />
            <span className="text-2xl font-bold">Yes<span className="text-primary">Boss</span></span>
          </div>

          <h1 className="text-4xl font-bold mb-4 leading-tight">
            Your AI-powered<br />
            <span className="gradient-text">Highly Intelligent Intern</span>
          </h1>
          <p className="text-text-muted text-lg mb-12 max-w-md">
            Join thousands of businesses using AI to make smarter decisions.
          </p>

          <div className="space-y-6">
            {[
              { icon: Shield, text: "Enterprise-grade security" },
              { icon: CheckCircle, text: "CXO's level insights" },
              { icon: User, text: "AI onboarding learns your business" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link href="/" className="inline-flex items-center gap-2 text-text-muted hover:text-foreground transition-colors mb-8 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">Create your account</h2>
            <p className="text-text-muted">Get started in less than a minute.</p>
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 mb-6">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              <span className="text-sm text-rose-300">{error}</span>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2">I am a</label>
              <div className="grid grid-cols-2 gap-3">
                {(["owner", "employee"] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${role === r ? "border-primary bg-primary/10" : "border-border hover:border-border-light"}`}
                  >
                    <div className="font-semibold capitalize">{r}</div>
                    <div className="text-xs text-text-muted mt-1">{r === "owner" ? "Business owner" : "Team member"}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => updateField("fullName", e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Email or Phone</label>
              <div className="relative">
                {contactKind === "phone" ? (
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                ) : (
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                )}
                <input
                  type="text"
                  value={formData.contact}
                  onChange={(e) => updateField("contact", e.target.value)}
                  placeholder="you@company.com or 555 000 0000"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                />
              </div>
              {formData.contact && contactKind === "unknown" && (
                <p className="text-xs text-rose-400 mt-1">Enter a valid email or phone number</p>
              )}
              {contactKind === "phone" && (
                <div className="flex items-center gap-2 mt-2">
                  <select
                    value={selectedCountry.code}
                    onChange={(e) => setSelectedCountry(COUNTRY_CODES.find(c => c.code === e.target.value) || COUNTRY_CODES[0])}
                    className="px-2 py-1 rounded-lg bg-surface border border-border text-xs"
                  >
                    {COUNTRY_CODES.map(c => (
                      <option key={c.code} value={c.code}>{c.code} {c.country}</option>
                    ))}
                  </select>
                  <span className="text-xs text-text-muted">Will send OTP to {selectedCountry.code} {formData.contact.replace(/\D/g, "")}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full pl-12 pr-12 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => updateField("confirmPassword", e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                />
              </div>
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="text-xs text-rose-400 mt-1">Passwords don&apos;t match</p>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit() || loading}
              className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign up <ArrowRight className="w-5 h-5" /></>}
            </button>

            <p className="text-center text-sm text-text-muted">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:text-primary-light cursor-pointer">Sign in here!</Link>
            </p>
          </div>
        </div>
      </div>

      {/* OTP Modal */}
      {otpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-background border border-border p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Verify your {contactKind === "phone" ? "phone" : "email"}</h3>
              <button
                type="button"
                onClick={() => {
                  if (!otpVerified) {
                    setOtpModalOpen(false);
                  }
                }}
                disabled={otpVerified}
                className="text-text-muted hover:text-foreground cursor-pointer disabled:opacity-30"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-text-muted mb-4">
              {otpVerified
                ? "Verified! We'll finish creating your account now."
                : `We sent a 6-digit code to ${contactKind === "email" ? formData.contact : `${selectedCountry.code} ${formData.contact.replace(/\D/g, "")}`}.`}
            </p>
            <div id="recaptcha-container-modal" style={{ position: "absolute", left: "-9999px", top: "auto", width: 1, height: 1, overflow: "hidden" }} />

            {otpError && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 mb-4">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span className="text-xs text-rose-300">{otpError}</span>
              </div>
            )}

            {otpVerified ? (
              <div className="flex items-center gap-2 text-emerald-400 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm">{contactKind === "phone" ? "Phone" : "Email"} verified</span>
              </div>
            ) : (
              <>
                {!otpSent && contactKind === "phone" && (
                  <button
                    type="button"
                    onClick={sendPhoneOtp}
                    disabled={otpLoading || !recaptchaReady}
                    className="w-full py-3 rounded-xl bg-primary/10 text-primary font-medium hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mb-3"
                  >
                    {otpLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Sending...</>
                    ) : !recaptchaReady ? (
                      <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Preparing verification...</>
                    ) : (
                      "Send OTP"
                    )}
                  </button>
                )}

                {otpSent && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">OTP Code</label>
                      <div className="relative">
                        <MessageSquare className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                        <input
                          type="text"
                          value={formData.otp}
                          onChange={(e) => setFormData((p) => ({ ...p, otp: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                          placeholder="Enter 6-digit OTP"
                          className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-text-muted text-right">
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : (
                        <button onClick={() => (contactKind === "phone" ? sendPhoneOtp() : sendOtpToBackend())} className="text-primary hover:underline cursor-pointer">Resend OTP</button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={verifyOtp}
                      disabled={otpLoading || formData.otp.length < 6}
                      className="w-full mt-4 py-3 rounded-xl bg-accent text-white font-medium disabled:opacity-50 cursor-pointer"
                    >
                      {otpLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : "Verify OTP"}
                    </button>
                  </>
                )}
              </>
            )}

            {otpVerified && (
              <button
                type="button"
                onClick={finalizeSignup}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold disabled:opacity-50 cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : "Create Account"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
