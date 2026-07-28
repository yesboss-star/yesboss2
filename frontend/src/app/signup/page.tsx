"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, User, Mail, Lock, Shield, CheckCircle, AlertCircle, Loader2, MessageSquare, X } from "lucide-react";
import { auth } from "@/lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type UserRole = "owner" | "employee";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

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
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    otp: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const canSubmit = () => {
    if (!formData.fullName.trim()) return false;
    if (!EMAIL_RE.test(formData.email.trim())) return false;
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
    await sendOtpToBackend();
  };

  const sendOtpToBackend = async () => {
    setOtpLoading(true);
    setOtpError("");
    try {
      const res = await fetch(`${API_URL}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.message || "Could not send OTP");
      }
      setOtpSent(true);
      setResendTimer(60);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send OTP";
      setOtpError(msg);
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
      const res = await fetch(`${API_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email.trim(), code: formData.otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.message || "Invalid OTP");
      }
      setVerificationToken(data.uid || null);
      setOtpVerified(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      setOtpError(msg);
    } finally {
      setOtpLoading(false);
    }
  };

  const finalizeSignup = async () => {
    if (!otpVerified) {
      setOtpError("Please verify the OTP first");
      return;
    }
    setLoading(true);
    setError("");
    setOtpError("");
    try {
      const credential = await createUserWithEmailAndPassword(auth, formData.email.trim(), formData.password);
      const firebaseUid = credential.user.uid;

      const userData: {
        uid: string; email: string; full_name: string; phone: string;
        role: UserRole; phone_verified: boolean; email_verified: boolean;
        verification_token?: string;
      } = {
        uid: firebaseUid,
        email: formData.email.trim(),
        full_name: formData.fullName,
        phone: "",
        role,
        phone_verified: false,
        email_verified: true,
      };

      if (verificationToken) {
        userData.verification_token = verificationToken;
      }

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
              { icon: CheckCircle, text: "CXO&apos;s level insights" },
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
              <label className="block text-sm font-medium mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                />
              </div>
              {formData.email && !EMAIL_RE.test(formData.email.trim()) && (
                <p className="text-xs text-rose-400 mt-1">Enter a valid email address</p>
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
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign up"}
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
              <h3 className="text-xl font-bold">Verify your email</h3>
              <button
                type="button"
                onClick={() => {
                  if (!otpVerified || otpError) {
                    setOtpModalOpen(false);
                    setOtpVerified(false);
                    setOtpError("");
                    setVerificationToken(null);
                    setOtpSent(false);
                    setFormData((p) => ({ ...p, otp: "" }));
                  }
                }}
                disabled={otpVerified && !otpError}
                className="text-text-muted hover:text-foreground cursor-pointer disabled:opacity-30"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-text-muted mb-4">
              {otpVerified
                ? "Verified! We'll finish creating your account now."
                : `We sent a 6-digit code to ${formData.email}.`}
            </p>

            {otpError && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 mb-4">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span className="text-xs text-rose-300">{otpError}</span>
              </div>
            )}

            {otpVerified ? (
              <div className="flex items-center gap-2 text-emerald-400 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm">Email verified</span>
              </div>
            ) : otpSent ? (
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
                    <button onClick={sendOtpToBackend} className="text-primary hover:underline cursor-pointer">Resend OTP</button>
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
            ) : null}

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
