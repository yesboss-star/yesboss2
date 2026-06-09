"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Mail, Lock, AlertCircle, Loader2, CheckCircle, Phone, User } from "lucide-react";
import { auth, RECAPTCHA_SITE_KEY } from "@/lib/firebase";
import { setPersistence, browserLocalPersistence, browserSessionPersistence, signInWithEmailAndPassword, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type LoginTab = "email" | "phone";

const COUNTRY_CODES = [
  { code: "+91", country: "India" },
  { code: "+1", country: "US/Canada" },
  { code: "+44", country: "UK" },
  { code: "+61", country: "Australia" },
  { code: "+971", country: "UAE" },
  { code: "+65", country: "Singapore" },
];

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<LoginTab>("email");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Phone OTP state
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recaptchaVerifierRef = useRef<any>(null);

  const [formData, setFormData] = useState({
    email: "",
    phone: "",
    otp: "",
    password: "",
    keepSignedIn: true,
  });

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  useEffect(() => {
    if (tab !== "phone") return;
    if (typeof window === "undefined") return;
    if (recaptchaVerifierRef.current) return;

    const loadScript = () => {
      if (document.getElementById("google-recaptcha-js")) return;
      const script = document.createElement("script");
      script.id = "google-recaptcha-js";
      script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    };

    const initRecaptcha = async () => {
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
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, "recaptcha-container-login", {
          siteKey: RECAPTCHA_SITE_KEY,
          size: "invisible",
          callback: () => {},
        });
      } catch (err) {
        console.error("Recaptcha init error:", err);
      }
    };

    initRecaptcha();
  }, [tab]);

  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const finalizeLogin = async (uid: string, email: string) => {
    const storedUser = localStorage.getItem("yesboss_user");
    let userData = storedUser ? JSON.parse(storedUser) : { uid, email, role: "owner" };
    userData = { ...userData, uid: userData.uid || uid, email: userData.email || email };

    try {
      const syncRes = await fetch(`${API_URL}/auth/sync-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: userData.uid, email: userData.email, full_name: userData.full_name || "", role: userData.role || "owner", phone_verified: true }),
      });
      const syncData = await syncRes.json();
      if (syncData?.user?.role) userData.role = syncData.user.role;
    } catch {}

    localStorage.setItem("yesboss_user", JSON.stringify(userData));
    localStorage.setItem("yesboss_role", userData.role);
    const userCookie = encodeURIComponent(JSON.stringify(userData));
    document.cookie = `yesboss_token=true; path=/; max-age=86400; SameSite=Lax`;
    document.cookie = `yesboss_user=${userCookie}; path=/; max-age=86400; SameSite=Lax`;

    window.location.href = "/dashboard";
  };

  const handleEmailLogin = async () => {
    if (!formData.email) { setError("Email is required"); return; }
    if (!formData.password) { setError("Password is required"); return; }
    setLoading(true);
    setError("");
    try {
      await setPersistence(auth, formData.keepSignedIn ? browserLocalPersistence : browserSessionPersistence);
      const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
      await finalizeLogin(userCredential.user.uid, formData.email);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.code === "auth/invalid-email") setError("Invalid email address");
      else if (err.code === "auth/invalid-credential") setError("Wrong email or password");
      else if (err.code === "auth/user-not-found") setError("No account found with this email");
      else setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const sendPhoneOtp = async () => {
    const digitsOnly = formData.phone.replace(/\D/g, "");
    if (digitsOnly.length < 6) { setError("Enter a valid phone number"); return; }
    setPhoneOtpLoading(true);
    setError("");
    try {
      const formattedPhone = `${selectedCountry.code}${digitsOnly}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifierRef.current);
      setConfirmationResult(result);
      setPhoneOtpSent(true);
      setResendTimer(60);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.code === "auth/invalid-phone-number") setError("Invalid phone number for selected country");
      else if (err.code === "auth/too-many-requests") setError("Too many attempts. Try later");
      else if (err.code === "auth/requires-android-redirect") setError("Please use a desktop browser for phone verification");
      else setError(err.message || "Failed to send OTP");
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  const verifyPhoneOtp = async () => {
    if (!formData.otp || formData.otp.length < 6) { setError("Enter the 6-digit OTP"); return; }
    if (!confirmationResult) { setError("Session expired. Tap resend."); return; }
    setLoading(true);
    setError("");
    try {
      const result = await confirmationResult.confirm(formData.otp);
      const phoneEmail = `${selectedCountry.code}${formData.phone.replace(/\D/g, "")}@phone.yesboss.app`;
      await finalizeLogin(result.user?.uid || "phone-user", phoneEmail);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.code === "auth/invalid-verification-code") setError("Invalid OTP");
      else setError(err.message || "Verification failed");
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
            <span className="text-2xl font-bold">
              Yes<span className="text-primary">Boss</span>
            </span>
          </div>

          <h1 className="text-4xl font-bold mb-4 leading-tight">
            Welcome back to<br />
            <span className="gradient-text">Your Command Center</span>
          </h1>
          <p className="text-text-muted text-lg mb-12 max-w-md">
            Your AI assistant has been working while you were away.
            Check your dashboard for new insights.
          </p>

          <div className="space-y-6">
            {[
              { icon: CheckCircle, text: "AI insights updated in real-time" },
              { icon: Lock, text: "Secure authentication with Firebase" },
              { icon: User, text: "Role-based workspace access" },
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
            href="/"
            className="inline-flex items-center gap-2 text-text-muted hover:text-foreground transition-colors mb-8 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">Welcome back</h2>
            <p className="text-text-muted">Log in to access your AI dashboard.</p>
          </div>

          {/* Segmented Email/Phone tabs */}
          <div className="flex p-1 rounded-xl bg-surface border border-border mb-6">
            {(["email", "phone"] as LoginTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer flex items-center justify-center gap-2 ${tab === t ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-foreground"}`}
              >
                {t === "email" ? <Mail className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                {t === "email" ? "Email" : "Phone"}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 mb-6">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              <span className="text-sm text-rose-300">{error}</span>
            </div>
          )}

          <div className="space-y-5">
            {tab === "email" ? (
              <>
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
                </div>

                {/* Forgot password link ABOVE password */}
                <div className="flex items-center justify-end">
                  <Link href="/forgot-password" className="text-sm text-primary hover:text-primary-light transition-colors cursor-pointer">
                    Forgot password?
                  </Link>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => updateField("password", e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-12 pr-12 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-foreground transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.keepSignedIn}
                    onChange={(e) => updateField("keepSignedIn", e.target.checked)}
                    className="w-4 h-4 rounded border-border bg-surface text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-sm text-text-muted">Keep me signed in</span>
                </label>

                <button
                  onClick={handleEmailLogin}
                  disabled={loading}
                  className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Log In"}
                </button>
              </>
            ) : (
              <>
                <div id="recaptcha-container-login" style={{ position: "absolute", left: "-9999px", top: "auto", width: 1, height: 1, overflow: "hidden" }} />
                <div>
                  <label className="block text-sm font-medium mb-2">Phone Number</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedCountry.code}
                      onChange={(e) => setSelectedCountry(COUNTRY_CODES.find(c => c.code === e.target.value) || COUNTRY_CODES[0])}
                      className="px-3 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm cursor-pointer"
                    >
                      {COUNTRY_CODES.map(c => (
                        <option key={c.code} value={c.code}>{c.code}</option>
                      ))}
                    </select>
                    <div className="relative flex-1">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        placeholder="555 000 0000"
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                      />
                    </div>
                  </div>
                </div>

                {!phoneOtpSent && (
                  <button
                    onClick={sendPhoneOtp}
                    disabled={phoneOtpLoading || formData.phone.replace(/\D/g, "").length < 6}
                    className="w-full py-3 rounded-xl bg-primary/10 text-primary font-medium hover:bg-primary/20 disabled:opacity-50 cursor-pointer"
                  >
                    {phoneOtpLoading ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Sending...</> : "Send OTP"}
                  </button>
                )}

                {phoneOtpSent && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">Enter OTP</label>
                      <input
                        type="text"
                        value={formData.otp}
                        onChange={(e) => updateField("otp", e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="6-digit code"
                        className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                      />
                      <div className="mt-2 text-sm text-text-muted text-right">
                        {resendTimer > 0 ? `Resend in ${resendTimer}s` : (
                          <button onClick={sendPhoneOtp} className="text-primary hover:underline cursor-pointer">Resend OTP</button>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={verifyPhoneOtp}
                      disabled={loading || formData.otp.length < 6}
                      className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> : "Verify & Log In"}
                    </button>
                  </>
                )}

                {/* Forgot password link still visible for phone users */}
                {!phoneOtpSent && (
                  <div className="flex items-center justify-end">
                    <Link href="/forgot-password" className="text-sm text-primary hover:text-primary-light transition-colors cursor-pointer">
                      Forgot password?
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="text-center text-sm text-text-muted mt-8">
            Or create an account{" "}
            <Link href="/signup" className="text-primary hover:text-primary-light transition-colors cursor-pointer font-medium">
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
