"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, Lock, Eye, EyeOff, AlertCircle, Loader2, CheckCircle, ShieldCheck } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_RE = /^\+?\d{6,15}$/;

export default function ForgotPasswordPage() {
  const [contact, setContact] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [stage, setStage] = useState<"send" | "verify" | "reset" | "done">("send");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugOtp, setDebugOtp] = useState<string | null>(null);

  const contactKind: "email" | "phone" | "unknown" = (() => {
    const v = contact.trim();
    if (!v) return "unknown";
    if (v.includes("@")) return EMAIL_RE.test(v) ? "email" : "unknown";
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 6) return "phone";
    return "unknown";
  })();

  const startResendTimer = () => {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) {
          clearInterval(interval);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async () => {
    if (contactKind === "unknown") {
      setError("Enter a valid email or phone number");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body = contactKind === "email" ? { email: contact.trim() } : { phone: contact.trim() };
      const res = await fetch(`${API_URL}/auth/forgot-password/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Could not send OTP");
      }
      setDebugOtp(data.debug_otp || null);
      setStage("verify");
      startResendTimer();
      // In dev, pre-fill the OTP from the debug_otp returned by the backend
      if (data.debug_otp) {
        setOtp(data.debug_otp);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body = contactKind === "email"
        ? { email: contact.trim(), otp }
        : { phone: contact.trim(), otp };
      const res = await fetch(`${API_URL}/auth/forgot-password/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.message || "Invalid OTP");
      }
      setResetToken(data.reset_token);
      setStage("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (!resetToken) {
      setError("Session expired. Start over.");
      setStage("send");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body = contactKind === "email"
        ? { email: contact.trim(), reset_token: resetToken, new_password: newPassword }
        : { phone: contact.trim(), reset_token: resetToken, new_password: newPassword };
      const res = await fetch(`${API_URL}/auth/forgot-password/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.message || "Could not reset password");
      }
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  const StepDots = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {["send", "verify", "reset"].map((s, i) => {
        const stageOrder = ["send", "verify", "reset"];
        const currentIdx = stageOrder.indexOf(stage);
        const isDone = currentIdx > i || stage === "done";
        const isActive = currentIdx === i && stage !== "done";
        return (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full transition-all ${isDone ? "bg-emerald-500" : isActive ? "bg-primary w-6" : "bg-border"}`} />
            {i < 2 && <div className={`w-8 h-0.5 ${currentIdx > i ? "bg-emerald-500" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative bg-surface overflow-hidden">
        <div className="hero-glow top-1/4 left-1/4 animate-pulse-glow" />
        <div className="hero-glow bottom-1/4 right-1/4 animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <span className="text-white font-bold text-xl">Y</span>
            </div>
            <span className="text-2xl font-bold">
              Yes<span className="text-primary">Boss</span>
            </span>
          </div>

          <h1 className="text-4xl font-bold mb-4 leading-tight">
            Forgot your<br />
            <span className="gradient-text">password?</span>
          </h1>
          <p className="text-text-muted text-lg mb-12 max-w-md">
            No worries. We&apos;ll help you get back into your account in just a few steps.
          </p>

          <div className="space-y-6">
            {[
              { icon: Mail, text: "We’ll send a 6-digit code to your email or phone" },
              { icon: ShieldCheck, text: "Your account stays secure — only you can reset it" },
              { icon: CheckCircle, text: "Choose a new password and you’re back in" },
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
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-text-muted hover:text-foreground transition-colors mb-8 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>

          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">Reset password</h2>
            <p className="text-text-muted">
              {stage === "send" && "Enter your email or phone to get a verification code."}
              {stage === "verify" && `Enter the 6-digit code we sent to ${contact}.`}
              {stage === "reset" && "Almost there! Choose a new password."}
              {stage === "done" && "Your password has been updated. You can now log in."}
            </p>
          </div>

          <StepDots />

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 mb-6">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              <span className="text-sm text-rose-300">{error}</span>
            </div>
          )}

          {debugOtp && stage === "verify" && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-4">
              <span className="text-xs text-amber-300">Dev mode OTP: <code className="font-mono">{debugOtp}</code></span>
            </div>
          )}

          {stage === "send" && (
            <div className="space-y-5">
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
                    value={contact}
                    onChange={(e) => { setContact(e.target.value); setError(""); }}
                    placeholder="you@company.com or +1 555 000 0000"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                    autoFocus
                  />
                </div>
                {contact && contactKind === "unknown" && (
                  <p className="text-xs text-rose-400 mt-1">Enter a valid email or phone number</p>
                )}
              </div>
              <button
                onClick={handleSendOtp}
                disabled={loading || contactKind === "unknown"}
                className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Code"}
              </button>
            </div>
          )}

          {stage === "verify" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">Verification Code</label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                  placeholder="6-digit code"
                  className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm tracking-[0.5em] text-center text-lg font-mono"
                  maxLength={6}
                  autoFocus
                />
              </div>
              <button
                onClick={handleVerifyOtp}
                disabled={loading || otp.length < 6}
                className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify Code"}
              </button>
              <div className="text-center text-sm text-text-muted">
                {resendTimer > 0 ? `Resend code in ${resendTimer}s` : (
                  <button onClick={handleSendOtp} disabled={loading} className="text-primary hover:underline cursor-pointer">Resend code</button>
                )}
                <span className="mx-2">·</span>
                <button onClick={() => { setStage("send"); setError(""); setOtp(""); }} className="text-text-muted hover:text-foreground cursor-pointer">Change {contactKind === "email" ? "email" : "phone"}</button>
              </div>
            </div>
          )}

          {stage === "reset" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                    placeholder="Min. 6 characters"
                    className="w-full pl-12 pr-12 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                    autoFocus
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
                <label className="block text-sm font-medium mb-2">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                    placeholder="Re-enter password"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                  />
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-rose-400 mt-1">Passwords don&apos;t match</p>
                )}
              </div>
              <button
                onClick={handleReset}
                disabled={loading || newPassword.length < 6 || newPassword !== confirmPassword}
                className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Reset Password"}
              </button>
            </div>
          )}

          {stage === "done" && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="w-12 h-12 text-emerald-400" />
                <p className="text-sm text-emerald-300 text-center">
                  Your password has been updated successfully.
                </p>
              </div>
              <Link
                href="/login"
                className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
              >
                Continue to login
              </Link>
            </div>
          )}

          {stage !== "done" && (
            <p className="text-center text-sm text-text-muted mt-8">
              Remembered your password?{" "}
              <Link href="/login" className="text-primary hover:text-primary-light cursor-pointer font-medium">
                Back to login
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
