"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import {
  ArrowRight,
  Building2,
  Globe,
  Users,
  Upload,
  Sparkles,
  CheckCircle,
  Loader2,
  ArrowLeft,
  Link2,
  Send,
  FileText,
  X,
  Clock,
  Search,
  ChevronDown,
  XCircle,
} from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type OnboardingStep = "welcome" | "time-request" | "org-details" | "ai-scan" | "file-upload" | "social" | "chat" | "create-now-later" | "complete";

interface IndustryOption {
  label: string;
  value: string;
  micro_verticals?: string[];
}

interface SocialLink {
  platform: string;
  url: string;
  detected: boolean;
  icon: React.ReactNode;
}

const INDUSTRY_MICRO_VERTICALS: Record<string, string[]> = {
  "Technology": [
    "Software Development",
    "SaaS / Cloud Services",
    "AI / Machine Learning",
    "Cybersecurity",
    "Fintech",
    "Edtech",
    "Healthtech",
    "E-commerce Platforms",
  ],
  "Finance": [
    "Banking",
    "Insurance",
    "Wealth Management",
    "Investment Banking",
    "Microfinance",
    "Accounting",
    "Payment Processing",
  ],
  "Healthcare": [
    "Hospitals & Clinics",
    "Pharmaceuticals",
    "Medical Devices",
    "Telehealth",
    "Healthcare IT",
    "Biotechnology",
    "Mental Health",
  ],
  "Retail": [
    "E-commerce",
    "Fashion & Apparel",
    "Electronics",
    "Food & Grocery",
    "Home & Furniture",
    "Beauty & Cosmetics",
    "Sports & Outdoors",
  ],
  "Manufacturing": [
    "Automotive",
    "Electronics",
    "Textiles & Garments",
    "Food Processing",
    "Machinery",
    "Chemicals",
    "Pharmaceutical Manufacturing",
    "Metal & Steel",
  ],
  "Education": [
    "K-12 Education",
    "Higher Education",
    "Online Learning",
    "EdTech",
    "Training & Development",
    "Coaching & Mentoring",
  ],
  "Consulting": [
    "Management Consulting",
    "IT Consulting",
    "Financial Consulting",
    "HR Consulting",
    "Marketing Consulting",
    "Legal Consulting",
  ],
  "Real Estate": [
    "Residential",
    "Commercial",
    "Property Management",
    "Real Estate Development",
    "Construction",
    "Architecture",
  ],
  "Media & Entertainment": [
    "Content Creation",
    "Film & TV",
    "Music",
    "Gaming",
    "Advertising",
    "Publishing",
  ],
  "Logistics": [
    "Transportation",
    "Warehousing",
    "Supply Chain",
    "Last Mile Delivery",
    "Freight Forwarding",
  ],
};

const INDUSTRY_FILE_SUGGESTIONS: Record<string, string[]> = {
  "Technology": [
    "Technical architecture docs",
    "Product roadmaps",
    "Code repositories overview",
    "Tech stack documentation",
  ],
  "Finance": [
    "Financial statements (P&L, Balance Sheet)",
    "Cash flow reports",
    "Budget templates",
    "Investment portfolios",
  ],
  "Healthcare": [
    "Patient flow diagrams",
    "Staff scheduling templates",
    "Medical inventory records",
    "Compliance documentation",
  ],
  "Retail": [
    "Inventory management sheets",
    "Sales reports",
    "Supplier lists",
    "Customer purchase history",
  ],
  "Manufacturing": [
    "Production schedules",
    "Quality control reports",
    "Equipment maintenance logs",
    "Supplier/vendor reports",
  ],
  "Education": [
    "Curriculum documents",
    "Student enrollment data",
    "Teacher/staff schedules",
    "Assessment results",
  ],
  "Consulting": [
    "Project timelines",
    "Client deliverables",
    "Resource allocation",
    "Case studies",
  ],
  "Real Estate": [
    "Property listings",
    "Lease agreements",
    "Maintenance schedules",
    "Tenant records",
  ],
  "Media & Entertainment": [
    "Content calendars",
    "Audience analytics",
    "Campaign performance reports",
    "Content rights documents",
  ],
  "Logistics": [
    "Route maps",
    "Fleet management data",
    "Shipping manifests",
    "Warehouse inventory",
  ],
};

export default function OwnerOnboarding() {
  const { user, signOut } = useAuth();
  const { setOrganization, createOrganization, detectSocialPresence } = useOrganizationStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const userEmail = searchParams.get("email") || user?.email || "";
  const userName = searchParams.get("name") || user?.email?.split("@")[0] || "";
  
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [orgId, setOrgId] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; processed: boolean; type: string }[]>([]);
  const [socialLinksList, setSocialLinksList] = useState<SocialLink[]>([]);
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showContinueChat, setShowContinueChat] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [aiTimeMinutes, setAiTimeMinutes] = useState<number>(2);
  const [analyzingIndustry, setAnalyzingIndustry] = useState(false);
  const [industrySuggestions, setIndustrySuggestions] = useState<IndustryOption[]>([]);
  const [showIndustryDropdown, setShowIndustryDropdown] = useState(false);
  const [customIndustryInput, setCustomIndustryInput] = useState("");
  const [microVerticals, setMicroVerticals] = useState<string[]>([]);
  const [selectedMicroVertical, setSelectedMicroVertical] = useState("");

  const [orgData, setOrgData] = useState({
    name: "",
    domain: "",
    industry: "",
    size: "",
    micro_vertical: "",
  });

  useEffect(() => {
    if (userEmail && !orgData.domain) {
      const extractedDomain = userEmail.split("@")[1] || "";
      if (extractedDomain) {
        setOrgData(prev => ({ ...prev, domain: extractedDomain }));
        analyzeIndustryFromDomain(extractedDomain);
      }
    }
  }, [userEmail]);

  const analyzeIndustryFromDomain = async (domain: string) => {
    setAnalyzingIndustry(true);
    try {
      const response = await fetch(`${API_URL}/intelligence/analyze/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.industry) {
          setOrgData(prev => ({
            ...prev,
            industry: data.industry,
            name: data.company_name || prev.name,
            size: data.company_size || prev.size,
          }));
          
          const verticals = INDUSTRY_MICRO_VERTICALS[data.industry] || [];
          setMicroVerticals(verticals);
          
          if (data.micro_vertical) {
            setSelectedMicroVertical(data.micro_vertical);
          } else if (verticals.length > 0) {
            setSelectedMicroVertical(verticals[0]);
          }
        }
        
        if (data.suggested_industries?.length) {
          const suggestions: IndustryOption[] = data.suggested_industries.map((ind: string) => ({
            label: ind,
            value: ind,
            micro_verticals: INDUSTRY_MICRO_VERTICALS[ind] || [],
          }));
          setIndustrySuggestions(suggestions);
        }
      }
    } catch (error) {
      console.error("Failed to analyze industry:", error);
    } finally {
      setAnalyzingIndustry(false);
    }
  };

  const searchIndustrySuggestions = async (query: string) => {
    if (query.length < 2) {
      setIndustrySuggestions([]);
      return;
    }
    
    const allIndustries = Object.keys(INDUSTRY_MICRO_VERTICALS);
    const matched = allIndustries
      .filter(ind => ind.toLowerCase().includes(query.toLowerCase()))
      .map(ind => ({
        label: ind,
        value: ind,
        micro_verticals: INDUSTRY_MICRO_VERTICALS[ind] || [],
      }));
    
    setIndustrySuggestions(matched.slice(0, 3));
  };

  const handleIndustrySelect = (industry: string) => {
    setOrgData(prev => ({
      ...prev,
      industry,
      micro_vertical: "",
    }));
    setMicroVerticals(INDUSTRY_MICRO_VERTICALS[industry] || []);
    setSelectedMicroVertical("");
    setShowIndustryDropdown(false);
    setCustomIndustryInput("");
  };

  const processDomain = (domain: string) => {
    let processed = domain.trim().toLowerCase();
    if (processed.startsWith("http://")) processed = processed.replace("http://", "");
    if (processed.startsWith("https://")) processed = processed.replace("https://", "");
    if (processed.startsWith("www.")) processed = processed.replace("www.", "");
    return processed.split("/")[0];
  };

  const getFileSuggestions = () => {
    const industry = orgData.industry || "Technology";
    return INDUSTRY_FILE_SUGGESTIONS[industry] || INDUSTRY_FILE_SUGGESTIONS["Technology"];
  };

  const handleWelcomeContinue = async () => {
    setStep("time-request");
  };

  const handleTimeRequestContinue = () => {
    setStep("org-details");
  };

  const handleTimeRequestLater = async () => {
    try {
      const domain = processDomain(orgData.domain);
      const org = await createOrganization({
        name: orgData.name || domain.split(".")[0],
        domain,
        industry: orgData.industry || "Technology",
        size: orgData.size || "1-10",
      });
      setOrgId(org.id);
      router.push("/dashboard");
    } catch (error) {
      console.error("Failed to create organization:", error);
      setStep("org-details");
    }
  };

  const handleOrgDetailsSubmit = async () => {
    try {
      const domain = processDomain(orgData.domain);
      const org = await createOrganization({
        name: orgData.name,
        domain,
        industry: orgData.industry,
        size: orgData.size,
      });
      setOrgId(org.id);
      setOrganization({
        ...org,
        createdAt: org.createdAt,
      });
      setStep("ai-scan");
    } catch (error) {
      console.error("Failed to create organization:", error);
      alert("Failed to create organization. Please try again.");
    }
  };

  const handleStartScan = async () => {
    setScanning(true);
    setScanProgress(0);
    const domain = processDomain(orgData.domain);
    
    try {
      const response = await fetch(`${API_URL}/scrape/company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });

      const interval = setInterval(() => {
        setScanProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setScanning(false);
            setStep("file-upload");
            return 100;
          }
          return prev + 2;
        });
      }, 60);
    } catch (error) {
      console.error("AI scan failed:", error);
      const interval = setInterval(() => {
        setScanProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setScanning(false);
            setStep("file-upload");
            return 100;
          }
          return prev + 2;
        });
      }, 60);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: { name: string; processed: boolean; type: string }[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newFiles.push({ name: file.name, processed: false, type: file.type });
    }

    setUploadedFiles([...uploadedFiles, ...newFiles]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);
      if (orgId) formData.append("organization_id", orgId);

      try {
        const response = await fetch(`${API_URL}/files/process`, {
          method: "POST",
          body: formData,
        });
        
        if (response.ok) {
          setUploadedFiles(prev => 
            prev.map((f, idx) => 
              f.name === file.name ? { ...f, processed: true } : f
            )
          );
        }
      } catch (error) {
        console.error("File upload failed:", error);
        setUploadedFiles(prev => 
          prev.map((f, idx) => 
            f.name === file.name ? { ...f, processed: true } : f
          )
        );
      }
    }
  };

  const handleSocialDetection = async () => {
    const domain = processDomain(orgData.domain);
    try {
      const links = await detectSocialPresence(domain);
      const platforms = [
        { platform: "LinkedIn", url: links.linkedin || "", detected: !!links.linkedin, icon: <Link2 className="w-5 h-5" /> },
        { platform: "Twitter / X", url: links.twitter || "", detected: !!links.twitter, icon: <Link2 className="w-5 h-5" /> },
        { platform: "Instagram", url: links.instagram || "", detected: !!links.instagram, icon: <Link2 className="w-5 h-5" /> },
        { platform: "Facebook", url: links.facebook || "", detected: !!links.facebook, icon: <Link2 className="w-5 h-5" /> },
        { platform: "YouTube", url: links.youtube || "", detected: !!links.youtube, icon: <Link2 className="w-5 h-5" /> },
      ];
      setSocialLinksList(platforms);
    } catch (error) {
      console.error("Social detection failed:", error);
      setSocialLinksList([
        { platform: "LinkedIn", url: "", detected: false, icon: <Link2 className="w-5 h-5" /> },
        { platform: "Twitter / X", url: "", detected: false, icon: <Link2 className="w-5 h-5" /> },
        { platform: "Instagram", url: "", detected: false, icon: <Link2 className="w-5 h-5" /> },
        { platform: "Facebook", url: "", detected: false, icon: <Link2 className="w-5 h-5" /> },
        { platform: "YouTube", url: "", detected: false, icon: <Link2 className="w-5 h-5" /> },
      ]);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMessage = chatInput;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setChatLoading(true);
    setShowContinueChat(false);

    try {
      const response = await fetch(`${API_URL}/chatbot/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          organization_id: orgId,
          context: { industry: orgData.industry, size: orgData.size, micro_vertical: selectedMicroVertical },
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        setChatMessages(prev => [...prev, { role: "assistant", content: result.response }]);
        setShowContinueChat(true);
      } else {
        setChatMessages(prev => [...prev, { role: "assistant", content: "I'm here to help you understand your business better. Please ask me about your industry, priorities, or challenges." }]);
        setShowContinueChat(true);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setChatMessages(prev => [...prev, { role: "assistant", content: "I'm here to help you understand your business better. Please ask me about your industry, priorities, or challenges." }]);
      setShowContinueChat(true);
    } finally {
      setChatLoading(false);
    }
  };

  const handleContinueChatYes = () => {
    setShowContinueChat(false);
    setChatInput("");
  };

  const handleContinueChatNo = () => {
    setStep("create-now-later");
  };

  const updateSocialLink = (index: number, url: string) => {
    const updated = [...socialLinksList];
    updated[index].url = url;
    updated[index].detected = !!url;
    setSocialLinksList(updated);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const steps = [
    { id: "welcome", label: "Welcome", icon: Sparkles },
    { id: "time-request", label: "Time", icon: Clock },
    { id: "org-details", label: "Company", icon: Building2 },
    { id: "ai-scan", label: "AI Scan", icon: Sparkles },
    { id: "file-upload", label: "Documents", icon: Upload },
    { id: "social", label: "Social", icon: Globe },
    { id: "chat", label: "AI Chat", icon: Users },
    { id: "complete", label: "Done", icon: CheckCircle },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <span className="text-white font-bold">Y</span>
            </div>
            <span className="text-lg font-bold">
              Yes<span className="text-primary">Boss</span>
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <span className="text-sm text-text-muted">
              {userEmail}
            </span>
            <button
              onClick={signOut}
              className="text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-center gap-2 mb-12">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-all ${
                  i <= currentStepIndex
                    ? "bg-primary/20 text-primary"
                    : "text-text-muted"
                }`}
              >
                <s.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-8 h-0.5 mx-2 ${
                    i < currentStepIndex ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* STEP 1: WELCOME */}
        {step === "welcome" && (
          <div className="max-w-xl mx-auto text-center">
            <div className="mb-8">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-3xl font-bold mb-2">
                Welcome, <span className="gradient-text">{userName}</span>!
              </h1>
              <p className="text-text-muted">
                We detected your company from your email. Let&apos;s build your AI Business OS.
              </p>
            </div>

            <div className="glass rounded-xl p-6 text-left mb-8">
              <div className="flex items-center gap-3 mb-3">
                <Globe className="w-5 h-5 text-primary" />
                <span className="font-medium">Detected Domain</span>
              </div>
              <p className="text-lg font-semibold">{orgData.domain || "Detecting..."}</p>
              {analyzingIndustry && (
                <div className="flex items-center gap-2 mt-2 text-text-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Analyzing your company...</span>
                </div>
              )}
            </div>

            <button
              onClick={handleWelcomeContinue}
              disabled={analyzingIndustry}
              className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* STEP 2: AI TIME REQUEST */}
        {step === "time-request" && (
          <div className="max-w-xl mx-auto text-center">
            <div className="mb-8">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Clock className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-3xl font-bold mb-2">
                We need <span className="gradient-text">{aiTimeMinutes} minutes</span>
              </h1>
              <p className="text-text-muted">
                Our AI needs a few minutes to understand your business deeply. This helps us create personalized insights and workflows.
              </p>
            </div>

            <div className="glass rounded-xl p-6 text-left mb-8">
              <h3 className="font-semibold mb-3">What happens during this time:</h3>
              <ul className="space-y-2 text-sm text-text-muted">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Analyze your company website and online presence
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Identify your industry and business model
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Understand your operational workflows
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Generate personalized AI insights
                </li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleTimeRequestLater}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                Later
              </button>
              <button
                onClick={handleTimeRequestContinue}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: ORG DETAILS (With Auto-detected Industry) */}
        {step === "org-details" && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">
                Tell us about your <span className="gradient-text">organization</span>
              </h1>
              <p className="text-text-muted">
                We auto-detected your industry. You can adjust or add details.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">Company Name</label>
                <input
                  type="text"
                  value={orgData.name}
                  onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                  placeholder="Acme Corporation"
                  className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Website Domain</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="text"
                    value={orgData.domain}
                    onChange={(e) => setOrgData({ ...orgData, domain: e.target.value })}
                    placeholder="acme.com"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Industry {analyzingIndustry && <span className="text-primary">(Auto-detected)</span>}
                </label>
                <div className="relative">
                  <div 
                    className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm cursor-pointer flex items-center justify-between"
                    onClick={() => setShowIndustryDropdown(!showIndustryDropdown)}
                  >
                    <span className={orgData.industry ? "" : "text-text-muted"}>
                      {orgData.industry || "Select industry"}
                    </span>
                    <ChevronDown className="w-5 h-5 text-text-muted" />
                  </div>
                  
                  {showIndustryDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-xl shadow-lg z-50 max-h-80 overflow-y-auto">
                      <div className="p-3 border-b border-border">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                          <input
                            type="text"
                            placeholder="Type to search..."
                            value={customIndustryInput}
                            onChange={(e) => {
                              setCustomIndustryInput(e.target.value);
                              searchIndustrySuggestions(e.target.value);
                            }}
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none"
                          />
                        </div>
                      </div>
                      
                      {industrySuggestions.map((ind, i) => (
                        <button
                          key={i}
                          onClick={() => handleIndustrySelect(ind.value)}
                          className="w-full px-4 py-3 text-left hover:bg-surface-light transition-colors"
                        >
                          <span className="font-medium text-sm">{ind.label}</span>
                        </button>
                      ))}
                      
                      {industrySuggestions.length === 0 && customIndustryInput && (
                        <div className="px-4 py-3 text-sm text-text-muted">
                          No exact match. Using custom: {customIndustryInput}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {microVerticals.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">Micro-Vertical</label>
                  <div className="grid grid-cols-2 gap-2">
                    {microVerticals.slice(0, 6).map((vertical, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedMicroVertical(vertical)}
                        className={`p-3 rounded-xl border-2 text-sm transition-all cursor-pointer text-left ${
                          selectedMicroVertical === vertical
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-border-light"
                        }`}
                      >
                        {vertical}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Company Size</label>
                <select
                  value={orgData.size}
                  onChange={(e) => setOrgData({ ...orgData, size: e.target.value })}
                  className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm appearance-none cursor-pointer"
                >
                  <option value="">Select size</option>
                  <option value="1-10">1-10 employees</option>
                  <option value="11-50">11-50 employees</option>
                  <option value="51-200">51-200 employees</option>
                  <option value="201-500">201-500 employees</option>
                  <option value="500+">500+ employees</option>
                </select>
              </div>

              <button
                onClick={handleOrgDetailsSubmit}
                disabled={!orgData.name || !orgData.domain || !orgData.industry}
                className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: AI SCAN */}
        {step === "ai-scan" && (
          <div className="max-w-xl mx-auto text-center">
            <div className="mb-8">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-3xl font-bold mb-2">
                AI Intelligence <span className="gradient-text">Scan</span>
              </h1>
              <p className="text-text-muted">
                Our AI will analyze your company&apos;s web presence to build an initial profile. This takes about 30 seconds.
              </p>
            </div>

            {scanning ? (
              <div className="space-y-6">
                <div className="h-3 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-100"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <div className="text-sm text-text-muted">
                  {scanProgress < 30 && "Scanning website..."}
                  {scanProgress >= 30 && scanProgress < 60 && "Analyzing industry data..."}
                  {scanProgress >= 60 && scanProgress < 90 && "Building company profile..."}
                  {scanProgress >= 90 && "Finalizing intelligence..."}
                </div>
                <p className="text-2xl font-bold text-primary">{scanProgress}%</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="glass rounded-xl p-6 text-left">
                  <h3 className="font-semibold mb-2">What we&apos;ll analyze:</h3>
                  <ul className="space-y-2 text-sm text-text-muted">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      Company website content & structure
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      Industry benchmarks & trends
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      Competitor landscape
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      Social media presence
                    </li>
                  </ul>
                </div>

                <button
                  onClick={handleStartScan}
                  className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-5 h-5" />
                  Start AI Scan
                </button>

                <button
                  onClick={() => setStep("file-upload")}
                  className="text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  Skip for now →
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 5: FILE UPLOAD (Industry-Specific) */}
        {step === "file-upload" && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">
                Upload <span className="gradient-text">{orgData.industry}</span> documents
              </h1>
              <p className="text-text-muted">
                Based on your industry, we suggest these document types:
              </p>
            </div>

            <div className="glass rounded-xl p-4 mb-6">
              <h3 className="font-semibold mb-3 text-sm">Suggested for {orgData.industry}:</h3>
              <div className="space-y-2">
                {getFileSuggestions().map((file, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-text-muted">
                    <FileText className="w-4 h-4 text-primary" />
                    {file}
                  </div>
                ))}
              </div>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="glass rounded-2xl border-2 border-dashed border-border p-12 text-center mb-6 cursor-pointer hover:border-primary transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <p className="font-medium mb-1">Drop files here or click to upload</p>
              <p className="text-sm text-text-muted">PDF, Excel, Word, Images (max 25MB each)</p>
            </div>

            <div className="space-y-3 mb-8">
              {uploadedFiles.map((file, i) => (
                <div key={i} className="glass rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    {file.processed ? (
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-text-muted">{file.processed ? "Processed successfully" : "Processing..."}</p>
                  </div>
                  <button onClick={() => removeFile(i)} className="cursor-pointer">
                    <X className="w-4 h-4 text-text-muted hover:text-foreground" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("ai-scan")}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={() => {
                  handleSocialDetection();
                  setStep("social");
                }}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: SOCIAL */}
        {step === "social" && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">
                Connect your <span className="gradient-text">social presence</span>
              </h1>
              <p className="text-text-muted">
                We detected these social profiles for {orgData.name || "your company"}. Confirm or edit.
              </p>
            </div>

            <div className="space-y-4 mb-8">
              {socialLinksList.map((social, i) => (
                <div key={i} className="glass rounded-xl p-4 flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      social.detected ? "bg-primary/10" : "bg-surface"
                    }`}
                  >
                    <div className={social.detected ? "text-primary" : "text-text-muted"}>
                      {social.icon}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{social.platform}</p>
                    {social.detected ? (
                      <p className="text-xs text-text-muted">{social.url}</p>
                    ) : (
                      <input
                        type="text"
                        placeholder="Add URL (optional)"
                        value={social.url}
                        onChange={(e) => updateSocialLink(i, e.target.value)}
                        className="w-full mt-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs focus:border-primary focus:outline-none"
                      />
                    )}
                  </div>
                  {social.detected && (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("file-upload")}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={() => {
                  const links: any = {};
                  socialLinksList.forEach(s => {
                    if (s.url) links[s.platform.toLowerCase().replace(" / x", "_").replace(" ", "_")] = s.url;
                  });
                  if (orgId) {
                    fetch(`${API_URL}/organizations/${orgId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ social_links: links }),
                    }).catch(console.error);
                  }
                  setChatMessages([{ 
                    role: "assistant", 
                    content: `Hi! I've analyzed ${orgData.name || "your company"}'s web presence. Based on my analysis, you're in the ${orgData.industry || "technology"} space with ${selectedMicroVertical || ""} focus. ${orgData.size || "a growing"} team. What are your top 3 business priorities this quarter?` 
                  }]);
                  setStep("chat");
                }}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 7: CHAT (Infinite Loop) */}
        {step === "chat" && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">
                Meet your <span className="gradient-text">AI Business Analyst</span>
              </h1>
              <p className="text-text-muted">
                Ask anything about your business. The AI will learn from your answers to build a deeper understanding.
              </p>
            </div>

            <div className="glass rounded-2xl overflow-hidden mb-6">
              <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role !== "user" && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-white font-bold">AI</span>
                      </div>
                    )}
                    <div className={`rounded-lg px-4 py-2 text-sm max-w-md ${msg.role === "user" ? "bg-primary/20" : "glass-light"}`}>
                      {msg.content}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-primary font-bold">U</span>
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-white font-bold">AI</span>
                    </div>
                    <div className="glass-light rounded-lg px-4 py-2 text-sm max-w-md">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>

              {/* INFINITE LOOP PROMPT */}
              {showContinueChat && !chatLoading && (
                <div className="border-t border-border p-4 bg-primary/5">
                  <p className="text-sm text-center mb-3 text-text-muted">
                    Would you like to answer more questions so YesBoss can understand your company better?
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={handleContinueChatYes}
                      className="px-6 py-2 rounded-xl bg-primary hover:bg-primary-light text-white font-medium transition-all cursor-pointer"
                    >
                      Yes, continue
                    </button>
                    <button
                      onClick={handleContinueChatNo}
                      className="px-6 py-2 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer"
                    >
                      No, thanks
                    </button>
                  </div>
                </div>
              )}

              {!showContinueChat && (
                <div className="border-t border-border p-4">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Ask anything about your business..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                      className="flex-1 px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={chatLoading || !chatInput.trim()}
                      className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("social")}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={() => setStep("create-now-later")}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 8: CREATE NOW OR LATER */}
        {step === "create-now-later" && (
          <div className="max-w-xl mx-auto text-center">
            <div className="mb-8">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-3xl font-bold mb-2">
                Create your <span className="gradient-text">workspace</span>
              </h1>
              <p className="text-text-muted">
                Your AI business intelligence is ready. Would you like to create your operational workspace now?
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <button
                onClick={() => setStep("complete")}
                className="p-6 rounded-xl border-2 border-primary bg-primary/10 hover:bg-primary/20 transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3 mb-2">
                  <ArrowRight className="w-5 h-5 text-primary" />
                  <span className="font-semibold">Create Now</span>
                </div>
                <p className="text-sm text-text-muted">
                  Go directly to your AI-powered dashboard
                </p>
              </button>

              <button
                onClick={() => {
                  router.push("/");
                }}
                className="p-6 rounded-xl border-2 border-border hover:border-border-light transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3 mb-2">
                  <Clock className="w-5 h-5 text-text-muted" />
                  <span className="font-semibold">Later</span>
                </div>
                <p className="text-sm text-text-muted">
                  Save intelligence for later
                </p>
              </button>
            </div>
          </div>
        )}

        {/* STEP 9: COMPLETE */}
        {step === "complete" && (
          <div className="max-w-xl mx-auto text-center">
            <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-8 animate-float">
              <CheckCircle className="w-12 h-12 text-emerald-400" />
            </div>

            <h1 className="text-4xl font-bold mb-4">
              Your AI Business OS is <span className="gradient-text">Ready</span>
            </h1>
            <p className="text-text-muted text-lg mb-12">
              We&apos;ve built an initial intelligence profile for {orgData.name || "your company"}.
              Your AI agents are now analyzing your data in the background.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-12">
              {[
                { label: "AI Agents Active", value: "6" },
                { label: "Documents Processed", value: uploadedFiles.length.toString() },
                { label: "Industry", value: orgData.industry },
                { label: "Workflows Created", value: "3" },
              ].map((stat, i) => (
                <div key={i} className="glass rounded-xl p-6">
                  <div className="text-3xl font-bold text-primary">{stat.value}</div>
                  <div className="text-sm text-text-muted mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            <button
              onClick={() => router.push("/dashboard")}
              className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2 text-lg"
            >
              Go to Dashboard
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}