"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, User, Mail, Lock, Phone, Shield, CheckCircle, AlertCircle, Loader2, MessageSquare, ArrowRight } from "lucide-react";
import { auth, RECAPTCHA_SITE_KEY } from "@/lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";

type UserRole = "owner" | "employee";

const COUNTRY_CODES = [
  { code: "+91", country: "🇮🇳 India (Primary)" },
  { code: "+1", country: "+1 US/Canada" },
  { code: "+44", country: "+44 UK" },
  { code: "+61", country: "+61 Australia" },
  { code: "+971", country: "+971 UAE" },
  { code: "+92", country: "+92 Pakistan" },
  { code: "+880", country: "+880 Bangladesh" },
  { code: "+65", country: "+65 Singapore" },
  { code: "+60", country: "+60 Malaysia" },
  { code: "+66", country: "+66 Thailand" },
  { code: "+62", country: "+62 Indonesia" },
  { code: "+84", country: "+84 Vietnam" },
  { code: "+94", country: "+94 Sri Lanka" },
  { code: "+977", country: "+977 Nepal" },
  { code: "+975", country: "+975 Bhutan" },
  { code: "+856", country: "+856 Laos" },
  { code: "+95", country: "+95 Myanmar" },
  { code: "+855", country: "+855 Cambodia" },
  { code: "+673", country: "+673 Brunei" },
  { code: "+960", country: "+960 Maldives" },
];

export default function SignupPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [role, setRole] = useState<UserRole>("owner");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recaptchaVerifierRef = useRef<any>(null);

  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    otp: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  useEffect(() => {
    const loadRecaptcha = () => {
      if (typeof window === "undefined") return;
      if (document.getElementById("google-recaptcha-js")) return;
      
      const script = document.createElement("script");
      script.id = "google-recaptcha-js";
      script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    };

    loadRecaptcha();
  }, []);

  useEffect(() => {
    const initRecaptcha = async () => {
      if (typeof window === "undefined") return;
      if (recaptchaVerifierRef.current) return;
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      try {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
          siteKey: RECAPTCHA_SITE_KEY,
          size: "normal",
          callback: () => {},
        });
      } catch (err) {
        console.error("Recaptcha init error:", err);
      }
    };

    initRecaptcha();
  }, []);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const sendOTP = async () => {
    const digitsOnly = formData.phone.replace(/\D/g, "");
    if (digitsOnly.length < 6) {
      setError("Enter a valid phone number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formattedPhone = `${selectedCountry.code}${digitsOnly}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifierRef.current);
      setConfirmationResult(result);
      setOtpSent(true);
      setResendTimer(60);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error("OTP Error:", err);
      if (err.code === "auth/invalid-phone-number") {
        setError("Invalid phone number for selected country");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many attempts. Try later");
      } else if (err.code === "auth/requires-android-redirect") {
        setError("Please use a desktop browser for phone verification");
      } else {
        setError(err.message || "Failed to send OTP");
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (!formData.otp || formData.otp.length < 6) {
      setError("Enter valid OTP");
      return;
    }

    if (!confirmationResult) {
      setError("Session expired. Resend OTP");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await confirmationResult.confirm(formData.otp);
      setOtpVerified(true);
      setCurrentStep(3);
    } catch (err: any) {
      if (err.code === "auth/invalid-verification-code") {
        setError("Invalid OTP");
      } else {
        setError("Verification failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const resendOTP = async () => {
    if (resendTimer > 0) return;
    await sendOTP();
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return formData.fullName.trim().length > 0;
      case 2: return otpVerified;
      case 3: return formData.email.includes("@");
      case 4: return formData.password.length >= 6;
      case 5: return formData.password === formData.confirmPassword && formData.confirmPassword.length > 0;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSignup = async () => {
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const fullPhone = `${selectedCountry.code}${formData.phone.replace(/\D/g, "")}`;
      const userData = {
        uid: userCredential.user.uid,
        email: formData.email,
        full_name: formData.fullName,
        phone: fullPhone,
        role: role,
        phone_verified: otpVerified,
      };
      
      localStorage.setItem("yesboss_user", JSON.stringify(userData));
      localStorage.setItem("yesboss_role", role);
      
      const userCookie = encodeURIComponent(JSON.stringify(userData));
      document.cookie = `yesboss_token=true; path=/; max-age=86400; SameSite=Lax`;
      document.cookie = `yesboss_user=${userCookie}; path=/; max-age=86400; SameSite=Lax`;

      const dest = role === "owner" 
        ? `/onboarding/owner?email=${encodeURIComponent(formData.email)}&name=${encodeURIComponent(formData.fullName)}`
        : `/onboarding/employee?email=${encodeURIComponent(formData.email)}&name=${encodeURIComponent(formData.fullName)}`;
      router.push(dest);
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        setError("Email already registered");
      } else if (err.code === "auth/weak-password") {
        setError("Password too weak");
      } else {
        setError(err.message || "Signup failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const totalSteps = 6;
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className="min-h-screen flex">
      <div id="recaptcha-container" className="g-recaptcha"></div>
      
      <div className="hidden lg:flex lg:w-1/2 relative bg-surface overflow-hidden">
        <div className="hero-glow top-1/4 left-1/4 animate-pulse-glow" />
        <div className="hero-glow bottom-1/4 right-1/4 animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <span className="text-white font-bold text-xl">Y</span>
            </div>
            <span className="text-2xl font-bold">Yes<span className="text-primary">Boss</span></span>
          </div>

          <h1 className="text-4xl font-bold mb-4 leading-tight">
            Your AI-powered<br />
            <span className="gradient-text">Business OS</span>
          </h1>
          <p className="text-text-muted text-lg mb-12 max-w-md">
            Join thousands of businesses using AI to make smarter decisions.
          </p>

          <div className="space-y-6">
            {[
              { icon: Shield, text: "Enterprise-grade security" },
              { icon: CheckCircle, text: "14-day free trial" },
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
            <p className="text-text-muted">Step {currentStep} of {totalSteps}</p>
            <div className="mt-3 h-2 bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
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

            {currentStep === 1 && (
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
                <button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="w-full mt-6 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  Next <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {currentStep === 2 && (
              <div>
                <label className="block text-sm font-medium mb-2">Phone Number</label>
                <div className="flex gap-2">
                  <select
                    value={selectedCountry.code}
                    onChange={(e) => setSelectedCountry(COUNTRY_CODES.find(c => c.code === e.target.value) || COUNTRY_CODES[0])}
                    disabled={otpVerified}
                    className="px-3 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm disabled:opacity-50 cursor-pointer"
                  >
                    {COUNTRY_CODES.map(country => (
                      <option key={country.code} value={country.code}>
                        {country.code} ({country.country})
                      </option>
                    ))}
                  </select>
                  <div className="relative flex-1">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      placeholder="555 000 0000"
                      disabled={otpVerified}
                      className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm disabled:opacity-50"
                    />
                  </div>
                </div>
                <p className="text-xs text-text-muted mt-1">Selected: {selectedCountry.code} - {selectedCountry.country}</p>

                {!otpVerified && (
                  <button
                    type="button"
                    onClick={sendOTP}
                    disabled={loading || formData.phone.replace(/\D/g, "").length < 6}
                    className="w-full mt-4 py-3 rounded-xl bg-primary/10 text-primary font-medium hover:bg-primary/20 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Sending...</> : "Send OTP"}
                  </button>
                )}

                {otpSent && !otpVerified && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-2">Enter OTP</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <MessageSquare className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                        <input
                          type="text"
                          value={formData.otp}
                          onChange={(e) => updateField("otp", e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="Enter 6-digit OTP"
                          className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={verifyOTP}
                        disabled={loading || formData.otp.length < 6}
                        className="px-4 py-3 rounded-xl bg-accent text-white font-medium disabled:opacity-50 cursor-pointer"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                      </button>
                    </div>
                    <div className="mt-2 text-sm text-text-muted">
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : (
                        <button onClick={resendOTP} className="text-primary hover:underline cursor-pointer">Resend OTP</button>
                      )}
                    </div>
                  </div>
                )}

                {otpVerified && (
                  <div className="mt-4 flex items-center gap-2 text-emerald-400">
                    <CheckCircle className="w-5 h-5" />
                    <span>Phone verified</span>
                  </div>
                )}

                <button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="w-full mt-6 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  Next <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {currentStep === 3 && (
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="john@company.com"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                  />
                </div>
                <button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="w-full mt-6 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  Next <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {currentStep === 4 && (
              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full pl-12 pr-12 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="w-full mt-6 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  Next <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {currentStep === 5 && (
              <div>
                <label className="block text-sm font-medium mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => updateField("confirmPassword", e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                  />
                </div>
                <button
                  onClick={handleSignup}
                  disabled={loading || !canProceed()}
                  className="w-full mt-6 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Account"}
                </button>
              </div>
            )}

            <p className="text-center text-sm text-text-muted">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:text-primary-light cursor-pointer">Log in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}