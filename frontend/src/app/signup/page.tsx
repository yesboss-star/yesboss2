"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, User, Mail, Lock, Phone, Shield, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";

type FormStep = "details" | "success";
type UserRole = "owner" | "employee";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<FormStep>("details");
  const [role, setRole] = useState<UserRole>("owner");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const validateStep1 = () => {
    if (!formData.fullName.trim()) return "Full name is required";
    if (!formData.phone.trim()) return "Phone number is required";
    if (formData.phone.replace(/\D/g, "").length < 10) return "Enter a valid phone number";
    if (!formData.email.trim()) return "Email is required";
    if (!formData.email.includes("@")) return "Enter a valid email";
    if (!formData.password) return "Password is required";
    if (formData.password.length < 6) return "Password must be at least 6 characters";
    if (formData.password !== formData.confirmPassword) return "Passwords do not match";
    return "";
  };

  const handleSignup = async () => {
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      const userData = {
        uid: userCredential.user.uid,
        email: formData.email,
        full_name: formData.fullName,
        phone: formData.phone,
        role: role,
      };
      
      localStorage.setItem("yesboss_user", JSON.stringify(userData));
      localStorage.setItem("yesboss_role", role);
      
      const userCookie = encodeURIComponent(JSON.stringify(userData));
      document.cookie = `yesboss_token=true; path=/; max-age=86400; SameSite=Lax`;
      document.cookie = `yesboss_user=${userCookie}; path=/; max-age=86400; SameSite=Lax`;

      setStep("success");
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        setError("Email already registered");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak");
      } else {
        setError(err.message || "Signup failed");
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <span className="text-white font-bold text-xl">Y</span>
            </div>
            <span className="text-2xl font-bold">
              Yes<span className="text-primary">Boss</span>
            </span>
          </div>

          <h1 className="text-4xl font-bold mb-4 leading-tight">
            Your AI-powered<br />
            <span className="gradient-text">Business OS</span>
          </h1>
          <p className="text-text-muted text-lg mb-12 max-w-md">
            Join thousands of businesses using AI to make smarter decisions,
            automate workflows, and accelerate growth.
          </p>

          <div className="space-y-6">
            {[
              { icon: Shield, text: "Enterprise-grade security & encryption" },
              { icon: CheckCircle, text: "14-day free trial, no credit card required" },
              { icon: User, text: "AI onboarding learns your business automatically" },
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
            <h2 className="text-3xl font-bold mb-2">
              {step === "success" ? "Welcome aboard!" : "Create your account"}
            </h2>
            <p className="text-text-muted">
              {step === "success"
                ? "Your account has been created successfully."
                : "Start your free trial today."}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 mb-6">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              <span className="text-sm text-rose-300">{error}</span>
            </div>
          )}

          {step === "details" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">I am a</label>
                <div className="grid grid-cols-2 gap-3">
                  {(["owner", "employee"] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
                        role === r
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-border-light"
                      }`}
                    >
                      <div className="font-semibold capitalize">{r}</div>
                      <div className="text-xs text-text-muted mt-1">
                        {r === "owner" ? "Business owner / founder" : "Team member"}
                      </div>
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
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    placeholder="+1 (555) 000-0000"
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
                    placeholder="john@company.com"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                  />
                </div>
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
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-foreground transition-colors cursor-pointer"
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
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => updateField("confirmPassword", e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                  />
                </div>
              </div>

              <button
                onClick={handleSignup}
                disabled={loading}
                className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Create Account"
                )}
              </button>

              <p className="text-center text-sm text-text-muted">
                Already have an account?{" "}
                <Link href="/login" className="text-primary hover:text-primary-light transition-colors cursor-pointer">
                  Log in
                </Link>
              </p>
            </div>
          )}

          {step === "success" && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-emerald-400" />
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-2">Account Created!</h3>
                <p className="text-text-muted">
                  Welcome to YesBoss, {formData.fullName}. Your {role} account is ready.
                </p>
              </div>

              <button
                onClick={() => {
                  const dest = role === "owner" 
                    ? `/onboarding/owner?email=${encodeURIComponent(formData.email)}&name=${encodeURIComponent(formData.fullName)}`
                    : `/onboarding/employee?email=${encodeURIComponent(formData.email)}&name=${encodeURIComponent(formData.fullName)}`;
                  router.push(dest);
                }}
                className="block w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25"
              >
                Continue to Setup
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}