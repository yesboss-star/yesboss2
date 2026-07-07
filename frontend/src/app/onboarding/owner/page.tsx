"use client";

import { Suspense, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { signOut as firebaseSignOut } from "firebase/auth";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useUIStore } from "@/stores/uiStore";
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
  Send,
  FileText,
  X,
  Clock,
  ChevronDown,
  Plus,
  UserPlus,
  Search,
  TrendingUp,
  AlertTriangle,
  Brain,
  FileDown,
  Type,
  PencilLine,
} from "lucide-react";
import Link from "next/link";
import {
  COMPANY_SIZES,
  GENERIC_DOCUMENT_SUGGESTIONS,
  INDUSTRY_FILE_SUGGESTIONS,
  MICRO_VERTICAL_FILE_SUGGESTIONS,
} from "@/lib/onboarding-data";
import { downloadDocumentTemplate } from "@/lib/documentTemplates";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const PERSONAL_EMAIL_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "aol.com",
  "protonmail.com",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "gmx.com",
  "live.com",
  "msn.com",
  "me.com",
  "mac.com",
];

const isPersonalEmailDomain = (domain: string): boolean => {
  const cleanDomain = domain.toLowerCase().trim();
  return PERSONAL_EMAIL_DOMAINS.includes(cleanDomain);
};

const deriveCompanyNameFromDomain = (domain: string): string => {
  if (!domain) return "";
  let cleaned = domain.trim().toLowerCase();
  cleaned = cleaned.replace("https://", "").replace("http://", "").replace("www.", "");
  cleaned = cleaned.split("/")[0].split("?")[0].split("#")[0];
  if (!cleaned || !cleaned.includes(".")) return "";
  const parts = cleaned.split(".");
  const TLDs = new Set([
    "com", "co", "io", "ai", "net", "org", "app", "dev", "tech", "in", "us", "uk",
    "de", "fr", "jp", "cn", "au", "ca", "eu", "ru", "br", "it", "es", "nl", "se",
  ]);
  if (parts.length > 1 && TLDs.has(parts[parts.length - 1])) parts.pop();
  if (!parts.length) return "";
  const first = parts[0];
  if (!first) return "";
  const words: string[] = [];
  let current = "";
  for (const ch of first) {
    if (ch === "-" || ch === "_") {
      if (current) words.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) words.push(current);
  if (!words.length) return "";

  const SUFFIXES = [
    "systems", "system", "solutions", "solution", "technologies", "technology",
    "tech", "labs", "lab", "group", "global", "industries", "industry",
    "services", "service", "consulting", "consultants", "software", "apps",
    "digital", "media", "studios", "studio", "works", "workshop", "co",
    "inc", "llc", "ltd", "corp", "company",
  ];
  const PREFIXES = [
    "smart", "next", "open", "meta", "neo", "cloud", "data", "deep",
    "auto", "bio", "eco", "fin", "edge", "quantum",
  ];

  const finalWords: string[] = [];
  for (const w of words) {
    if (w.length >= 8) {
      let splitDone = false;
      for (const hint of SUFFIXES) {
        if (w.endsWith(hint) && w.length - hint.length >= 3) {
          finalWords.push(w.slice(0, w.length - hint.length));
          finalWords.push(hint);
          splitDone = true;
          break;
        }
      }
      if (!splitDone) {
        for (const hint of PREFIXES) {
          if (
            w.startsWith(hint) &&
            w.length - hint.length >= 3 &&
            !["the", "my", "our", "pro", "co", "inc", "llc", "ltd", "corp"].includes(hint)
          ) {
            finalWords.push(hint);
            finalWords.push(w.slice(hint.length));
            splitDone = true;
            break;
          }
        }
      }
      if (!splitDone) finalWords.push(w);
    } else {
      finalWords.push(w);
    }
  }
  return finalWords
    .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : ""))
    .filter(Boolean)
    .join(" ");
};

type OnboardingStep =
  | "org-details"
  | "file-upload"
  | "persona-time"
  | "persona-question"
  | "persona-more-time";

interface PersonaQuestion {
  question: string;
  options: string[];
  time_estimate: number;
  ask_more_time: boolean;
  need_more_time?: boolean;
  question_number: number;
}

export default function OwnerOnboarding() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-text-muted">Loading...</div>
        </div>
      }
    >
      <OwnerOnboardingContent />
    </Suspense>
  );
}

function OwnerOnboardingContent() {
  const { user, signOut } = useAuth();
  const { setOrganization, createOrganization } = useOrganizationStore();
  const {
    suggestions: docSuggestions,
    businessContext,
    suggestionsLoading,
    fetchSuggestions: fetchDocSuggestions,
  } = useDocumentStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const signupContact = useMemo(() => {
    const storedUser =
      typeof window !== "undefined" ? localStorage.getItem("yesboss_user") : null;
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed?.phone_verified && parsed?.phone) {
          return { kind: "phone" as const, phone: parsed.phone as string, email: "" };
        }
        if (parsed?.email && typeof parsed.email === "string") {
          return { kind: "email" as const, phone: "", email: parsed.email };
        }
      } catch {}
    }
    const paramEmail = (searchParams.get("email") || "").trim();
    if (paramEmail.endsWith("@phone.yesboss.app")) {
      return { kind: "phone" as const, phone: "", email: "" };
    }
    if (paramEmail) {
      return { kind: "email" as const, phone: "", email: paramEmail };
    }
    return {
      kind: "email" as const,
      phone: "",
      email: (user?.email as string) || "",
    };
  }, [searchParams, user]);

  const userEmail = signupContact.email;
  const [step, setStep] = useState<OnboardingStep>("org-details");
  const [orgId, setOrgId] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<
    {
      name: string;
      processed: boolean;
      type: string;
      aiStatus?: "analyzing" | "completed" | "failed";
      summary?: string;
    }[]
  >([]);

  const [personaTimeEstimate, setPersonaTimeEstimate] = useState(3);
  const [currentQuestion, setCurrentQuestion] = useState<PersonaQuestion | null>(null);
  const [personaAnswers, setPersonaAnswers] = useState<
    { question: string; answer: string }[]
  >([]);
  const [personaCustomAnswer, setPersonaCustomAnswer] = useState("");
  const [personaLoading, setPersonaLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docTextInput, setDocTextInput] = useState("");
  const [docTextSubmitting, setDocTextSubmitting] = useState(false);
  const [docTextSubmitted, setDocTextSubmitted] = useState(false);
  const [docTextError, setDocTextError] = useState("");
  const [docInputMode, setDocInputMode] = useState<"upload" | "text">("upload");
  const [templateDownloading, setTemplateDownloading] = useState<string | null>(null);

  const [autoFilledFromScan, setAutoFilledFromScan] = useState(false);
  const [websiteUrlAutoDetected, setWebsiteUrlAutoDetected] = useState(false);
  const [analyzingIndustry, setAnalyzingIndustry] = useState(false);
  const [companyNameSuggestions, setCompanyNameSuggestions] = useState<string[]>([]);
  const [showCompanyNameSuggestions, setShowCompanyNameSuggestions] = useState(false);
  const [industryInput, setIndustryInput] = useState("");
  const [microVerticalInput, setMicroVerticalInput] = useState("");
  const [industrySuggestions, setIndustrySuggestions] = useState<string[]>([]);
  const [microVerticalSuggestions, setMicroVerticalSuggestions] = useState<string[]>([]);
  const [showIndustrySuggestions, setShowIndustrySuggestions] = useState(false);
  const [showMicroVerticalSuggestions, setShowMicroVerticalSuggestions] = useState(false);

  const [existingOrg, setExistingOrg] = useState<{ _id: string; [k: string]: unknown } | null>(null);
  const [primaryOwnerInfo, setPrimaryOwnerInfo] = useState<{ full_name: string; email: string } | null>(null);
  const [showDuplicatePrompt, setShowDuplicatePrompt] = useState(false);
  const [duplicateChecking, setDuplicateChecking] = useState(true);
  const [joiningOrg, setJoiningOrg] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [requestError, setRequestError] = useState("");

  const initialEmailDomain = (userEmail.split("@")[1] || "").trim();
  const isPersonal = isPersonalEmailDomain(initialEmailDomain);
  const initialDerivedName = !isPersonal ? deriveCompanyNameFromDomain(initialEmailDomain) : "";
  const [orgData, setOrgData] = useState({
    name: initialDerivedName,
    domain: initialEmailDomain,
    website_url: "",
    industries: [] as string[],
    size: "1",
    micro_vertical: "",
    micro_verticals: [] as string[],
  });

  const industrySuggestSeq = useRef(0);
  const microVerticalSuggestSeq = useRef(0);
  const industryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const microVerticalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastAnalysisRef = useRef<{
    domain?: string;
    company_name?: string;
    social_links?: Record<string, string>;
    industry_suggestions?: string[];
    micro_vertical_suggestions?: string[];
  } | null>(null);

  const processDomain = (domain: string) => {
    let processed = domain.trim().toLowerCase();
    if (processed.startsWith("http://")) processed = processed.replace("http://", "");
    if (processed.startsWith("https://")) processed = processed.replace("https://", "");
    if (processed.startsWith("www.")) processed = processed.replace("www.", "");
    return processed.split("/")[0];
  };

  const analyzeIndustryFromDomain = useCallback(
    async (domain: string) => {
      if (!domain) return;
      const cleanDomain = processDomain(domain);
      if (!cleanDomain || !cleanDomain.includes(".")) return;
      if (cleanDomain.endsWith("phone.yesboss.app")) return;

      setAnalyzingIndustry(true);
      try {
        const response = await fetch(`${API_URL}/intelligence/analyze/domain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: cleanDomain }),
        });

        if (!response.ok) return;

        const responseData = await response.json();
        const data = responseData.profile || responseData;
        if (!data) return;

        const detectedName = (data.company_name || "").trim();

        lastAnalysisRef.current = {
          domain: cleanDomain,
          company_name: detectedName,
          social_links: data.social_links,
          industry_suggestions: data.industry_suggestions,
          micro_vertical_suggestions: data.micro_vertical_suggestions,
        };

        setOrgData((prev) => {
          const next = { ...prev, domain: cleanDomain };
          if (detectedName) next.name = detectedName;
          return next;
        });
        if (detectedName) setAutoFilledFromScan(true);
      } catch (error) {
        console.error("Failed to analyze industry:", error);
      } finally {
        setAnalyzingIndustry(false);
      }
    },
    []
  );

  useEffect(() => {
    // Trigger domain analysis and duplicate check when user email changes.
    setDuplicateChecking(true);

    if (!userEmail) { setDuplicateChecking(false); return; }
    const extractedDomain = userEmail.split("@")[1] || "";
    if (!extractedDomain) { setDuplicateChecking(false); return; }

    if (isPersonalEmailDomain(extractedDomain)) {
      setAutoFilledFromScan(false);
      setDuplicateChecking(false);
      return;
    }

    analyzeIndustryFromDomain(extractedDomain);

    fetch(`${API_URL}/organizations/by-domain/${encodeURIComponent(extractedDomain)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.organization?._id) {
          setExistingOrg(data.organization);
          if (data.primary_owner) {
            setPrimaryOwnerInfo(data.primary_owner);
          }
          setShowDuplicatePrompt(true);
        }
      })
      .catch(() => {})
      .finally(() => setDuplicateChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  useEffect(() => {
    // Debounced re-analyze when the user types/pastes a website URL.
    // Only fires for a clean domain (has at least one dot) and only when
    // it differs from the email-derived domain we already analyzed.
     
    const url = (orgData.website_url || "").trim();
    if (!url) return;
    const cleanDomain = processDomain(url);
    if (!cleanDomain || !cleanDomain.includes(".")) return;

    const emailDomain = (userEmail.split("@")[1] || "").trim().toLowerCase();
    if (cleanDomain === emailDomain) return;

    const handle = setTimeout(() => {
      analyzeIndustryFromDomain(cleanDomain);
    }, 1200);

    return () => clearTimeout(handle);
     
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgData.website_url]);

  useEffect(() => {
    if (!requestId || requestStatus === "approved" || requestStatus === "rejected") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/owner-requests/${requestId}/status`);
        if (res.ok) {
          const data = await res.json();
          setRequestStatus(data.status);
          if (data.status === "approved") {
            clearInterval(interval);
            const storedUser = localStorage.getItem("yesboss_user");
            const userData = storedUser ? JSON.parse(storedUser) : {};
            const uid = userData?.uid || user?.uid;
            const orgRes = await fetch(`${API_URL}/organizations/${existingOrg?._id}`);
            if (orgRes.ok) {
              const orgData2 = await orgRes.json();
              const org = orgData2.organization;
              const coOwners = org.co_owners || [];
              const ownerRank = org.owner_id === uid ? 1 : coOwners.indexOf(uid) + 2;
              useOrganizationStore.getState().setOrganization({
                id: org._id, name: org.name, domain: org.domain || "",
                industry: org.industry || "", size: org.size || "",
                website_url: org.website_url || "",
                createdAt: org.created_at || new Date().toISOString(),
                owner_id: org.owner_id, co_owners: coOwners, ownerRank,
              });
              setOrgId(org._id);
              setExistingOrg(null);
              if (storedUser) {
                const updatedUser = { ...JSON.parse(storedUser), owner_rank: ownerRank, organization_completed: true };
                localStorage.setItem("yesboss_user", JSON.stringify(updatedUser));
                document.cookie = `yesboss_user=${JSON.stringify(updatedUser)}; path=/; max-age=86400; SameSite=Lax`;
              }
              setRequestSent(false);
              setStep("persona-time");
            }
          }
        }
      } catch {
        // silent polling failure
      }
    }, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, requestStatus]);

  useEffect(() => {
    // When the user enters the file-upload step, ask the AI for
    // growth-driven document recommendations based on the org's context.
     
    if (step !== "file-upload") return;
    const companyName = orgData.name || lastAnalysisRef.current?.company_name || "";
    if (!companyName) return;
    fetchDocSuggestions({
      domain: orgData.domain || "",
      company_name: companyName,
      industry: orgData.industries[0] || "",
      micro_vertical: orgData.micro_verticals[0] || "",
      size: orgData.size || "",
      existing_documents: uploadedFiles.map((f) => ({ filename: f.name })),
    });
     
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const companyNameSuggestSeq = useRef(0);

  const fetchCompanyNameSuggestions = useCallback(
    async (query: string) => {
      const seq = ++companyNameSuggestSeq.current;
      try {
        const res = await fetch(`${API_URL}/intelligence/company-name-suggest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            industry: orgData.industries[0] || "",
            limit: 50,
          }),
        });
        if (!res.ok) {
          if (seq === companyNameSuggestSeq.current) setCompanyNameSuggestions([]);
          return;
        }
        const data = await res.json();
        if (seq !== companyNameSuggestSeq.current) return;
        const names = Array.isArray(data.suggestions) ? data.suggestions : [];
        setCompanyNameSuggestions(names);
      } catch {
        if (seq === companyNameSuggestSeq.current) setCompanyNameSuggestions([]);
      }
    },
    [orgData.industries]
  );

  const handleCompanyNameSuggestionSelect = (name: string, isCustom: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setOrgData((prev) => ({ ...prev, name: trimmed }));
    setShowCompanyNameSuggestions(false);
    setCompanyNameSuggestions([]);
    if (isCustom) {
      saveCustomTaxonomy("company_names", trimmed, orgData.industries[0]);
    }
  };

  const fetchIndustrySuggestions = useCallback(async (query: string) => {
    const seq = ++industrySuggestSeq.current;
    try {
      const res = await fetch(`${API_URL}/intelligence/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, type: "industries", limit: 100 }),
      });
      if (!res.ok) {
        if (seq === industrySuggestSeq.current) setIndustrySuggestions([]);
        return;
      }
      const data = await res.json();
      if (seq !== industrySuggestSeq.current) return;
      setIndustrySuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch {
      if (seq === industrySuggestSeq.current) setIndustrySuggestions([]);
    }
  }, []);

  const fetchMicroVerticalSuggestions = useCallback(
    async (query: string, industry: string) => {
      const seq = ++microVerticalSuggestSeq.current;
      try {
        const res = await fetch(`${API_URL}/intelligence/suggest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, type: "micro_verticals", industry, limit: 100 }),
        });
        if (!res.ok) {
          if (seq === microVerticalSuggestSeq.current) setMicroVerticalSuggestions([]);
          return;
        }
        const data = await res.json();
        if (seq !== microVerticalSuggestSeq.current) return;
        setMicroVerticalSuggestions(
          Array.isArray(data.suggestions) ? data.suggestions : []
        );
      } catch {
        if (seq === microVerticalSuggestSeq.current) setMicroVerticalSuggestions([]);
      }
    },
    []
  );

  const debouncedFetchIndustry = useCallback(
    (query: string) => {
      if (industryDebounceRef.current) clearTimeout(industryDebounceRef.current);
      industryDebounceRef.current = setTimeout(() => {
        fetchIndustrySuggestions(query);
      }, 150);
    },
    [fetchIndustrySuggestions]
  );

  const debouncedFetchMicroVertical = useCallback(
    (query: string, industry: string) => {
      if (microVerticalDebounceRef.current) clearTimeout(microVerticalDebounceRef.current);
      microVerticalDebounceRef.current = setTimeout(() => {
        fetchMicroVerticalSuggestions(query, industry);
      }, 150);
    },
    [fetchMicroVerticalSuggestions]
  );

  useEffect(() => {
    return () => {
      if (industryDebounceRef.current) clearTimeout(industryDebounceRef.current);
      if (microVerticalDebounceRef.current) clearTimeout(microVerticalDebounceRef.current);
    };
  }, []);

  const localIndustryMatches = useMemo(() => {
    const q = industryInput.trim().toLowerCase();
    if (!q) return [];
    const industries = new Set<string>();
    Object.keys(INDUSTRY_FILE_SUGGESTIONS).forEach((k) => industries.add(k));
    return Array.from(industries)
      .filter((i) => i.toLowerCase().includes(q))
      .slice(0, 6);
  }, [industryInput]);

  const localMicroVerticalMatches = useMemo(() => {
    const q = microVerticalInput.trim().toLowerCase();
    if (!q) return [];
    const industry = orgData.industries[0];
    const sources: string[][] = [];
    if (industry && MICRO_VERTICAL_FILE_SUGGESTIONS[industry]) {
      sources.push(MICRO_VERTICAL_FILE_SUGGESTIONS[industry]);
    }
    Object.values(MICRO_VERTICAL_FILE_SUGGESTIONS).forEach((arr: string[]) => sources.push(arr));
    const all = new Set<string>();
    sources.forEach((s) => s.forEach((v: string) => all.add(v)));
    return Array.from(all)
      .filter((v) => v.toLowerCase().includes(q))
      .slice(0, 6);
  }, [microVerticalInput, orgData.industries]);

  const getFileSuggestions = () => {
    const industry = orgData.industries[0];
    const microVertical = orgData.micro_verticals[0];

    if (!industry && !microVertical) {
      return GENERIC_DOCUMENT_SUGGESTIONS;
    }

    const industrySuggestions = industry
      ? INDUSTRY_FILE_SUGGESTIONS[industry] || []
      : [];
    const microVerticalSuggestions = microVertical
      ? MICRO_VERTICAL_FILE_SUGGESTIONS[microVertical] || []
      : [];

    const combined = [...microVerticalSuggestions, ...industrySuggestions];
    const unique = [...new Set(combined)];
    if (unique.length < 5) {
      const remaining = GENERIC_DOCUMENT_SUGGESTIONS.filter((g) => !unique.includes(g));
      unique.push(...remaining.slice(0, 8 - unique.length));
    }
    return unique.slice(0, 8);
  };

  const shorten = (text: string, max: number): string => {
    const t = (text || "").trim().replace(/\s+/g, " ");
    if (t.length <= max) return t;
    const slice = t.slice(0, max);
    const lastSpace = slice.lastIndexOf(" ");
    const base = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
    return base.replace(/[.,;:!?\-–—\s]+$/, "") + "…";
  };

  const saveCustomTaxonomy = async (
    type: "industries" | "micro_verticals" | "company_names",
    value: string,
    industry?: string
  ) => {
    if (!value || !value.trim()) return;
    try {
      await fetch(`${API_URL}/intelligence/taxonomy/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value: value.trim(), industry }),
      });
    } catch (err) {
      console.error("Failed to save custom taxonomy:", err);
    }
  };

  const addIndustry = (industry: string, persistCustom = true) => {
    const trimmed = industry.trim();
    if (!trimmed || orgData.industries.includes(trimmed)) {
      setIndustryInput("");
      setShowIndustrySuggestions(false);
      return;
    }
    setOrgData((prev) => ({ ...prev, industries: [...prev.industries, trimmed] }));
    setIndustryInput("");
    setShowIndustrySuggestions(false);
    if (persistCustom) saveCustomTaxonomy("industries", trimmed);
  };

  const removeIndustry = (industry: string) => {
    setOrgData((prev) => ({
      ...prev,
      industries: prev.industries.filter((i) => i !== industry),
    }));
  };

  const addMicroVertical = (mv: string, persistCustom = true) => {
    const trimmed = mv.trim();
    if (!trimmed || orgData.micro_verticals.some((m) => m.toLowerCase() === trimmed.toLowerCase())) {
      setMicroVerticalInput("");
      setShowMicroVerticalSuggestions(false);
      return;
    }
    setOrgData((prev) => ({
      ...prev,
      micro_verticals: [...prev.micro_verticals, trimmed],
      micro_vertical: prev.micro_verticals.length === 0 ? trimmed : prev.micro_vertical,
    }));
    setMicroVerticalInput("");
    setShowMicroVerticalSuggestions(false);
    if (persistCustom) saveCustomTaxonomy("micro_verticals", trimmed, orgData.industries[0]);
  };

  const removeMicroVertical = (mv: string) => {
    setOrgData((prev) => {
      const filtered = prev.micro_verticals.filter((m) => m !== mv);
      return {
        ...prev,
        micro_verticals: filtered,
        micro_vertical: filtered.length > 0 ? filtered[0] : "",
      };
    });
  };

  const handleDuplicateYes = async () => {
    if (!existingOrg?._id) return;
    setJoiningOrg(true);
    try {
      const storedUser = localStorage.getItem("yesboss_user");
      const userData = storedUser ? JSON.parse(storedUser) : {};
      const uid = userData?.uid || user?.uid;
      const res = await fetch(`${API_URL}/organizations/${existingOrg._id}/add-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      if (!res.ok) throw new Error("Failed to add owner");
      const data = await res.json();
      const org = data.organization;

      const coOwners = org.co_owners || [];
      const ownerRank = org.owner_id === uid ? 1 : coOwners.indexOf(uid) + 2;

      setOrganization({
        id: org._id,
        name: org.name,
        domain: org.domain || "",
        industry: org.industry || "",
        size: org.size || "",
        website_url: org.website_url || "",
        createdAt: org.created_at || new Date().toISOString(),
        owner_id: org.owner_id,
        co_owners: coOwners,
        ownerRank,
      });
      setOrgId(org._id);
      setShowDuplicatePrompt(false);
      setExistingOrg(null);

      if (storedUser) {
        const updatedUser = {
          ...JSON.parse(storedUser),
          owner_rank: ownerRank,
          organization_completed: true,
        };
        localStorage.setItem("yesboss_user", JSON.stringify(updatedUser));
        document.cookie = `yesboss_user=${JSON.stringify(updatedUser)}; path=/; max-age=86400; SameSite=Lax`;
      }

      setStep("persona-time");
    } catch (err) {
      console.error("Failed to join existing org:", err);
      alert("Failed to join organization. Please try again.");
    } finally {
      setJoiningOrg(false);
    }
  };

  const handleRequestOwner = async () => {
    if (!existingOrg?._id) return;
    // Optimistic UI: immediately show request sent page
    setShowDuplicatePrompt(false);
    setRequestSent(true);
    setRequestError("");

    const storedUser = localStorage.getItem("yesboss_user");
    const userData = storedUser ? JSON.parse(storedUser) : {};
    const uid = userData?.uid || user?.uid;
    const fullName = userData?.displayName || user?.displayName || user?.email || "User";
    const email = userData?.email || user?.email || "";

    try {
      const res = await fetch(`${API_URL}/organizations/${existingOrg._id}/request-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, email, full_name: fullName }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to send request");
      }

      const data = await res.json();
      setRequestId(data.request_id);
      setRequestStatus("pending");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setRequestError(message);
    }
  };

  const handleCheckRequestStatus = async () => {
    if (!requestId) return;
    setCheckingStatus(true);
    try {
      const res = await fetch(`${API_URL}/owner-requests/${requestId}/status`);
      if (!res.ok) throw new Error("Failed to check status");
      const data = await res.json();
      setRequestStatus(data.status);
      if (data.status === "approved") {
        const storedUser = localStorage.getItem("yesboss_user");
        const userData = storedUser ? JSON.parse(storedUser) : {};
        const uid = userData?.uid || user?.uid;
        const orgRes = await fetch(`${API_URL}/organizations/${existingOrg?._id}`);
        if (orgRes.ok) {
          const orgData2 = await orgRes.json();
          const org = orgData2.organization;
          const coOwners = org.co_owners || [];
          const ownerRank = org.owner_id === uid ? 1 : coOwners.indexOf(uid) + 2;
          useOrganizationStore.getState().setOrganization({
            id: org._id,
            name: org.name,
            domain: org.domain || "",
            industry: org.industry || "",
            size: org.size || "",
            website_url: org.website_url || "",
            createdAt: org.created_at || new Date().toISOString(),
            owner_id: org.owner_id,
            co_owners: coOwners,
            ownerRank,
          });
          setOrgId(org._id);
          setExistingOrg(null);
          if (storedUser) {
            const updatedUser = { ...JSON.parse(storedUser), owner_rank: ownerRank, organization_completed: true };
            localStorage.setItem("yesboss_user", JSON.stringify(updatedUser));
            document.cookie = `yesboss_user=${JSON.stringify(updatedUser)}; path=/; max-age=86400; SameSite=Lax`;
          }
          setRequestSent(false);
          setStep("persona-time");
        }
      }
    } catch {
      setRequestError("Could not check status. Try again.");
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleResendRequest = async () => {
    if (!existingOrg?._id) return;
    setJoiningOrg(true);
    setRequestError("");
    try {
      const storedUser = localStorage.getItem("yesboss_user");
      const userData = storedUser ? JSON.parse(storedUser) : {};
      const uid = userData?.uid || user?.uid;
      const fullName = userData?.displayName || user?.displayName || user?.email || "User";
      const email = userData?.email || user?.email || "";

      const res = await fetch(`${API_URL}/organizations/${existingOrg._id}/request-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, email, full_name: fullName }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to resend request");
      }

      const data = await res.json();
      setRequestId(data.request_id);
      setRequestStatus("pending");
      useUIStore.getState().addNotification({
        type: "success", title: "Request Resent", message: "A new approval request has been sent.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setRequestError(message);
    } finally {
      setJoiningOrg(false);
    }
  };

  const handleDuplicateNo = async () => {
    setSigningOut(true);
    setShowDuplicatePrompt(false);
    setPrimaryOwnerInfo(null);
    setRequestSent(false);
    setRequestId(null);
    setRequestStatus(null);
    setRequestError("");
    setExistingOrg(null);
    localStorage.removeItem("yesboss_token");
    localStorage.removeItem("yesboss_user");
    localStorage.removeItem("yesboss_role");
    document.cookie = "yesboss_token=; path=/; max-age=0; SameSite=Lax";
    document.cookie = "yesboss_user=; path=/; max-age=0; SameSite=Lax";
    try {
      await firebaseSignOut(auth);
    } catch {}
    router.push("/signup");
  };

  const handleOrgDetailsSubmit = async () => {
    if (!orgData.name.trim()) {
      alert("Please enter a company name to continue.");
      return;
    }

    try {
      const domain = processDomain(orgData.domain);

      // Check if domain is already registered before attempting creation
      const domainCheck = await fetch(`${API_URL}/organizations/by-domain/${encodeURIComponent(domain)}`);
      if (domainCheck.ok) {
        const domainData = await domainCheck.json();
        if (domainData?.organization?._id) {
          setExistingOrg(domainData.organization);
          if (domainData.primary_owner) {
            setPrimaryOwnerInfo(domainData.primary_owner);
          }
          setShowDuplicatePrompt(true);
          return;
        }
      }

      const org = await createOrganization({
        name: orgData.name,
        domain,
        industry: orgData.industries[0] || "Technology & Software",
        industries: orgData.industries,
        size: orgData.size || "1",
        micro_vertical: orgData.micro_verticals[0] || "",
        micro_verticals: orgData.micro_verticals,
        website_url: orgData.website_url,
      });
      setOrgId(org.id);
      const storedUser = localStorage.getItem("yesboss_user");
      const userData = storedUser ? JSON.parse(storedUser) : {};
      setOrganization({
        ...org,
        createdAt: org.createdAt,
        owner_id: org.owner_id || userData?.uid,
        ownerRank: 1,
      });

      setStep("file-upload");
    } catch (error: any) {
      console.error("Failed to create organization:", error);
      const is409 = error?.message?.includes("409") || error?.status === 409 || error?.detail?.includes("already exists");
      if (is409) {
        try {
          const domain = processDomain(orgData.domain);
          const res = await fetch(`${API_URL}/organizations/by-domain/${encodeURIComponent(domain)}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.organization?._id) {
              setExistingOrg(data.organization);
              if (data.primary_owner) {
                setPrimaryOwnerInfo(data.primary_owner);
              }
              setShowDuplicatePrompt(true);
              return;
            }
          }
        } catch {
          // fallback to alert below
        }
        alert("This company domain is already registered. Please contact the existing owner to be added as a co-owner.");
      } else {
        alert("Failed to create organization. Please try again.");
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: {
      name: string;
      processed: boolean;
      type: string;
      aiStatus: "analyzing" | "completed" | "failed";
    }[] = [];
    for (let i = 0; i < files.length; i++) {
      newFiles.push({
        name: files[i].name,
        processed: false,
        type: files[i].type,
        aiStatus: "analyzing",
      });
    }

    setUploadedFiles((prev) => [...prev, ...newFiles]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("org_id", orgId || "temp");
      formData.append("user_id", user?.uid || "temp");
      if (orgData.name) formData.append("company_name", orgData.name);
      if (orgData.industries[0]) formData.append("industry", orgData.industries[0]);
      if (orgData.micro_verticals[0])
        formData.append("micro_vertical", orgData.micro_verticals[0]);

      try {
        const response = await fetch(`${API_URL}/files/process`, {
          method: "POST",
          body: formData,
        });
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.name === file.name
              ? { ...f, processed: true, aiStatus: response.ok ? "analyzing" : "failed" }
              : f
          )
        );
        if (!response.ok) {
          console.error("File upload failed:", response.status);
        }
      } catch (error) {
        console.error("File upload error:", error);
        setUploadedFiles((prev) =>
          prev.map((f) => (f.name === file.name ? { ...f, processed: true, aiStatus: "failed" } : f))
        );
      }
    }
  };

  const handleTextSubmit = async () => {
    const text = docTextInput.trim();
    if (!text) {
      setDocTextError("Please type at least a few lines about your business.");
      return;
    }
    if (text.length < 50) {
      setDocTextError("Please add a bit more detail (at least 50 characters).");
      return;
    }

    setDocTextError("");
    setDocTextSubmitted(true);
    setDocTextSubmitting(true);

    const filename = `company-notes-${new Date().toISOString().slice(0, 10)}.txt`;
    const blob = new Blob([text], { type: "text/plain" });
    const file = new File([blob], filename, { type: "text/plain" });

    setUploadedFiles((prev) => [
      ...prev,
      { name: filename, processed: false, type: "text/plain", aiStatus: "analyzing" },
    ]);
    setDocTextInput("");

    (async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("org_id", orgId || "temp");
        formData.append("user_id", user?.uid || "temp");
        if (orgData.name) formData.append("company_name", orgData.name);
        if (orgData.industries[0]) formData.append("industry", orgData.industries[0]);
        if (orgData.micro_verticals[0])
          formData.append("micro_vertical", orgData.micro_verticals[0]);

        const response = await fetch(`${API_URL}/files/process`, {
          method: "POST",
          body: formData,
        });

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.name === filename
              ? {
                  ...f,
                  processed: true,
                  aiStatus: response.ok ? "completed" : "failed",
                }
              : f
          )
        );

        if (!response.ok) {
          setDocTextError("We could not analyse the text. Please try again.");
        }
      } catch (error) {
        console.error("Text submit error:", error);
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.name === filename ? { ...f, processed: true, aiStatus: "failed" } : f
          )
        );
        setDocTextError("Network error. Please try again.");
      } finally {
        setDocTextSubmitting(false);
      }
    })();
  };

  const handleTemplateDownload = async (s: {
    title: string;
    category: string;
    why_it_helps: string;
    example_contents?: string;
  }) => {
    const key = s.title;
    setTemplateDownloading(key);
    try {
      await downloadDocumentTemplate(
        {
          title: s.title,
          category: s.category,
          whyItHelps: s.why_it_helps,
          exampleContents: s.example_contents,
        },
        orgData.name || "Your Company"
      );
    } catch (err) {
      console.error("Template download failed:", err);
    } finally {
      setTemplateDownloading(null);
    }
  };

  const handlePersonaTimeYes = async () => {
    setPersonaLoading(true);
    try {
      const response = await fetch(`${API_URL}/chatbot/persona/generate-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgData.name,
          industry: orgData.industries[0] || "",
          micro_vertical: orgData.micro_verticals[0] || "",
          company_size: orgData.size,
          domain: orgData.domain,
          social_links: {},
          previous_answers: personaAnswers,
          question_count: personaAnswers.length,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setPersonaTimeEstimate(data.time_estimate || 3);
        setCurrentQuestion(data);
        setPersonaCustomAnswer("");
        setStep("persona-question");
      }
    } catch (error) {
      console.error("Failed to generate persona question:", error);
      setCurrentQuestion({
        question: "What are your top business priorities this quarter?",
        options: ["Growth and revenue", "Operational efficiency", "Team and culture"],
        time_estimate: 3,
        ask_more_time: false,
        question_number: 1,
      });
      setStep("persona-question");
    } finally {
      setPersonaLoading(false);
    }
  };

  const completeOnboarding = () => {
    const storedUser = localStorage.getItem("yesboss_user");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      userData.organization_completed = true;
      localStorage.setItem("yesboss_user", JSON.stringify(userData));
      document.cookie = `yesboss_user=${JSON.stringify(userData)}; path=/; max-age=86400; SameSite=Lax`;
    }
    window.location.href = "/dashboard";
  };

  const handlePersonaTimeNo = () => {
    completeOnboarding();
  };

  const handlePersonaAnswer = async (answer: string) => {
    if (!currentQuestion) return;

    const newAnswer = { question: currentQuestion.question, answer };
    const updatedAnswers = [...personaAnswers, newAnswer];
    setPersonaAnswers(updatedAnswers);
    setPersonaCustomAnswer("");

    if (currentQuestion.need_more_time) {
      setStep("persona-more-time");
      return;
    }

    setPersonaLoading(true);
    try {
      const response = await fetch(`${API_URL}/chatbot/persona/generate-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgData.name,
          industry: orgData.industries[0] || "",
          micro_vertical: orgData.micro_verticals[0] || "",
          company_size: orgData.size,
          domain: orgData.domain,
          social_links: {},
          previous_answers: updatedAnswers,
          question_count: updatedAnswers.length,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.question) {
          setCurrentQuestion(data);
          setPersonaCustomAnswer("");
        } else {
          setCurrentQuestion(null);
          completeOnboarding();
        }
      } else {
        setCurrentQuestion(null);
        completeOnboarding();
      }
    } catch (error) {
      console.error("Failed to generate next question:", error);
      setCurrentQuestion(null);
      completeOnboarding();
    } finally {
      setPersonaLoading(false);
    }
  };

  const handlePersonaMoreTimeYes = async () => {
    setPersonaLoading(true);
    try {
      const response = await fetch(`${API_URL}/chatbot/persona/generate-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgData.name,
          industry: orgData.industries[0] || "",
          micro_vertical: orgData.micro_verticals[0] || "",
          company_size: orgData.size,
          domain: orgData.domain,
          social_links: {},
          previous_answers: personaAnswers,
          question_count: personaAnswers.length,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentQuestion(data);
        setPersonaCustomAnswer("");
        setStep("persona-question");
      }
    } catch (error) {
      console.error("Failed to generate question:", error);
      completeOnboarding();
    } finally {
      setPersonaLoading(false);
    }
  };

  const handlePersonaMoreTimeNo = () => {
    completeOnboarding();
  };

  useEffect(() => {
    // Goals step removed — default goals are auto-generated by the backend on org creation
  }, []);

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const stepsConfig = [
    { id: "org-details", label: "Company", icon: Building2 },
    { id: "file-upload", label: "Documents", icon: Upload },
    { id: "persona-time", label: "Persona", icon: Users },
    { id: "persona-question", label: "Persona", icon: Users },
    { id: "persona-more-time", label: "Persona", icon: Users },
  ];

  const personaSteps = ["persona-time", "persona-question", "persona-more-time"];
  const displaySteps = stepsConfig.filter(
    (s, i, arr) => arr.findIndex((t) => t.label === s.label) === i
  );
  const getDisplayIndex = (stepId: string) => {
    if (personaSteps.includes(stepId)) return displaySteps.findIndex((s) => s.label === "Persona");
    return displaySteps.findIndex((s) => s.id === stepId);
  };
  const currentStepIndex = getDisplayIndex(step);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <img src="/yesboss-logo.svg" alt="YesBoss" className="w-8 h-8" />
            <span className="text-lg font-bold">
              Yes<span className="text-primary">Boss</span>
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <span className="text-sm text-text-muted">{userEmail}</span>
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
        {!requestSent && (
        <div className="flex items-center justify-center gap-2 mb-12 overflow-x-auto">
          {displaySteps.map((s, i) => (
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
              {i < displaySteps.length - 1 && (
                <div
                  className={`w-8 h-0.5 mx-2 ${
                    i < currentStepIndex ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        )}

        {!requestSent && (<>
        {/* STEP 1: ORG DETAILS */}
        {step === "org-details" && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">
                Tell us about your <span className="gradient-text">organization</span>
              </h1>
              <p className="text-text-muted">
                {autoFilledFromScan
                  ? "We auto-detected your company details. You can adjust or add more."
                  : "Enter your company details below."}
                {analyzingIndustry && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-primary">
                    <Loader2 className="w-3 h-3 animate-spin" /> analyzing
                  </span>
                )}
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Company Name
                  {autoFilledFromScan && (
                    <span className="text-emerald-400 text-xs ml-2">(Auto-detected)</span>
                  )}
                </label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="text"
                    value={orgData.name}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOrgData((prev) => ({ ...prev, name: value }));
                      if (value.length >= 2) {
                        fetchCompanyNameSuggestions(value);
                        setShowCompanyNameSuggestions(true);
                      } else {
                        setCompanyNameSuggestions([]);
                        setShowCompanyNameSuggestions(false);
                      }
                    }}
                    onFocus={() => {
                      if (orgData.name.length >= 2) {
                        if (companyNameSuggestions.length === 0) {
                          fetchCompanyNameSuggestions(orgData.name);
                        }
                        setShowCompanyNameSuggestions(true);
                      }
                    }}
                    onBlur={() =>
                      setTimeout(() => setShowCompanyNameSuggestions(false), 200)
                    }
                    placeholder="Start typing company name..."
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                  />
                  {showCompanyNameSuggestions && companyNameSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-xl shadow-lg z-30 max-h-60 overflow-y-auto">
                      <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-text-muted border-b border-border">
                        Suggested company names
                      </div>
                      {companyNameSuggestions.map((name, i) => (
                        <button
                          key={i}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleCompanyNameSuggestionSelect(name, false);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-surface-light transition-colors border-b border-border last:border-b-0 text-sm"
                        >
                          {name}
                        </button>
                      ))}
                      {orgData.name.trim() &&
                        !companyNameSuggestions.some(
                          (s) => s.toLowerCase() === orgData.name.trim().toLowerCase()
                        ) && (
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleCompanyNameSuggestionSelect(orgData.name, true);
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-surface-light transition-colors text-sm italic text-primary border-t border-border bg-surface-light/50"
                          >
                            Other — use &quot;{orgData.name.trim()}&quot; (custom)
                          </button>
                        )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Website URL{" "}
                  {websiteUrlAutoDetected && (
                    <span className="text-emerald-400 text-xs">(Auto-detected)</span>
                  )}
                </label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="text"
                    value={orgData.website_url}
                    onChange={(e) => {
                      setOrgData({ ...orgData, website_url: e.target.value });
                      if (websiteUrlAutoDetected) setWebsiteUrlAutoDetected(false);
                    }}
                    placeholder="https://www.yourcompany.com (optional)"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                  />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Optional. We&apos;ll auto-detect your industry and documents if you add it.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Industry</label>
                <div className="space-y-3">
                  {orgData.industries.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {orgData.industries.map((ind, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm"
                        >
                          {ind}
                          <button
                            onClick={() => removeIndustry(ind)}
                            className="hover:bg-primary/20 rounded-full p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          type="text"
                          value={industryInput}
                          onChange={(e) => {
                            const v = e.target.value;
                            setIndustryInput(v);
                            setShowIndustrySuggestions(true);
                            debouncedFetchIndustry(v);
                          }}
                          onFocus={() => {
                            setShowIndustrySuggestions(true);
                            if (industrySuggestions.length === 0) {
                              debouncedFetchIndustry(industryInput);
                            }
                          }}
                          onBlur={() => setTimeout(() => setShowIndustrySuggestions(false), 200)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && industryInput.trim()) {
                              addIndustry(industryInput.trim());
                            }
                          }}
                          placeholder="Type to search or add industry..."
                          className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (industryInput.trim()) addIndustry(industryInput.trim());
                        }}
                        className="px-4 py-3.5 rounded-xl bg-primary hover:bg-primary-light text-white font-medium transition-colors cursor-pointer"
                      >
                        <span className="text-lg">+</span>
                      </button>
                    </div>
                    {showIndustrySuggestions &&
                      (localIndustryMatches.length > 0 ||
                        industrySuggestions.length > 0 ||
                        industryInput.trim().length > 0) && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                          {localIndustryMatches.length > 0 && (
                            <>
                              <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-text-muted border-b border-border bg-surface-light/30">
                                Quick matches
                              </div>
                              {localIndustryMatches
                                .filter(
                                  (ind) =>
                                    !orgData.industries.some(
                                      (existing) => existing.toLowerCase() === ind.toLowerCase()
                                    )
                                )
                                .map((ind, i) => (
                                  <button
                                    key={`local-${i}`}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      addIndustry(ind);
                                    }}
                                    className="w-full px-4 py-2.5 text-left hover:bg-surface-light transition-colors border-b border-border text-sm cursor-pointer font-medium"
                                  >
                                    {ind}
                                  </button>
                                ))}
                            </>
                          )}
                          {industrySuggestions
                            .filter(
                              (ind) =>
                                !orgData.industries.some(
                                  (existing) => existing.toLowerCase() === ind.toLowerCase()
                                ) && !localIndustryMatches.includes(ind)
                            )
                            .slice(0, 8)
                            .map((ind, i) => (
                              <button
                                key={`api-${i}`}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  addIndustry(ind);
                                }}
                                className="w-full px-4 py-2.5 text-left hover:bg-surface-light transition-colors border-b border-border text-sm cursor-pointer"
                              >
                                {ind}
                              </button>
                            ))}
                          {industryInput.trim() &&
                            !industrySuggestions.some(
                              (s) => s.toLowerCase() === industryInput.trim().toLowerCase()
                            ) &&
                            !localIndustryMatches.some(
                              (s) => s.toLowerCase() === industryInput.trim().toLowerCase()
                            ) && (
                              <button
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  addIndustry(industryInput.trim());
                                }}
                                className="w-full px-4 py-3 text-left hover:bg-surface-light transition-colors text-sm cursor-pointer border-t border-border bg-surface-light/50 italic text-primary"
                              >
                                Other — use &quot;{industryInput.trim()}&quot; (custom)
                              </button>
                            )}
                        </div>
                      )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Micro-Verticals</label>
                <div className="space-y-3">
                  {orgData.micro_verticals.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {orgData.micro_verticals.map((mv, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-500 text-sm"
                        >
                          {mv}
                          <button
                            onClick={() => removeMicroVertical(mv)}
                            className="hover:bg-purple-500/20 rounded-full p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          type="text"
                          value={microVerticalInput}
                          onChange={(e) => {
                            const v = e.target.value;
                            setMicroVerticalInput(v);
                            setShowMicroVerticalSuggestions(true);
                            debouncedFetchMicroVertical(v, orgData.industries[0] || "");
                          }}
                          onFocus={() => {
                            setShowMicroVerticalSuggestions(true);
                            if (microVerticalSuggestions.length === 0) {
                              debouncedFetchMicroVertical(
                                microVerticalInput,
                                orgData.industries[0] || ""
                              );
                            }
                          }}
                          onBlur={() =>
                            setTimeout(() => setShowMicroVerticalSuggestions(false), 300)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && microVerticalInput.trim()) {
                              addMicroVertical(microVerticalInput.trim());
                            }
                          }}
                          placeholder="e.g., Custom Software, SaaS, AI Solutions..."
                          className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (microVerticalInput.trim()) addMicroVertical(microVerticalInput.trim());
                        }}
                        className="px-4 py-3.5 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-medium transition-colors cursor-pointer"
                      >
                        <span className="text-lg">+</span>
                      </button>
                    </div>
                    {showMicroVerticalSuggestions &&
                      (localMicroVerticalMatches.length > 0 ||
                        microVerticalSuggestions.length > 0 ||
                        microVerticalInput.trim().length > 0) && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                          {localMicroVerticalMatches.length > 0 && (
                            <>
                              <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-text-muted border-b border-border bg-surface-light/30">
                                Quick matches
                              </div>
                              {localMicroVerticalMatches
                                .filter(
                                  (mv) =>
                                    !orgData.micro_verticals.some(
                                      (existing) => existing.toLowerCase() === mv.toLowerCase()
                                    )
                                )
                                .map((mv, i) => (
                                  <button
                                    key={`local-mv-${i}`}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      addMicroVertical(mv);
                                    }}
                                    className="w-full px-4 py-2.5 text-left hover:bg-surface-light transition-colors border-b border-border text-sm cursor-pointer font-medium"
                                  >
                                    {mv}
                                  </button>
                                ))}
                            </>
                          )}
                          {microVerticalSuggestions
                            .filter(
                              (mv) =>
                                !orgData.micro_verticals.some(
                                  (existing) => existing.toLowerCase() === mv.toLowerCase()
                                ) && !localMicroVerticalMatches.includes(mv)
                            )
                            .slice(0, 8)
                            .map((mv, i) => (
                              <button
                                key={`api-mv-${i}`}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  addMicroVertical(mv);
                                }}
                                className="w-full px-4 py-2.5 text-left hover:bg-surface-light transition-colors border-b border-border text-sm cursor-pointer"
                              >
                                {mv}
                              </button>
                            ))}
                          {microVerticalInput.trim() &&
                            !microVerticalSuggestions.some(
                              (s) => s.toLowerCase() === microVerticalInput.trim().toLowerCase()
                            ) &&
                            !localMicroVerticalMatches.some(
                              (s) => s.toLowerCase() === microVerticalInput.trim().toLowerCase()
                            ) && (
                              <button
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  addMicroVertical(microVerticalInput.trim());
                                }}
                                className="w-full px-4 py-3 text-left hover:bg-surface-light transition-colors text-sm cursor-pointer border-t border-border bg-surface-light/50 italic text-purple-500"
                              >
                                Other — use &quot;{microVerticalInput.trim()}&quot; (custom)
                              </button>
                            )}
                        </div>
                      )}
                  </div>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Add multiple micro-verticals relevant to your business
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Company Size</label>
                <div className="relative">
                  <select
                    value={orgData.size}
                    onChange={(e) => setOrgData({ ...orgData, size: e.target.value })}
                    className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm appearance-none cursor-pointer pr-10"
                  >
                    {COMPANY_SIZES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                </div>
              </div>

              <button
                onClick={handleOrgDetailsSubmit}
                disabled={!orgData.name.trim() || analyzingIndustry}
                className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: FILE UPLOAD */}
        {step === "file-upload" && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold mb-2">
                Help your AI understand your business
              </h1>
              <p className="text-text-muted">
                {orgData.industries[0]
                  ? `Based on your industry (${orgData.industries[0]}${
                      orgData.micro_verticals[0] ? `, ${orgData.micro_verticals[0]}` : ""
                    }), these are the documents that will unlock the most growth insight.`
                  : "Upload a few key business documents so your AI can give you sharp, specific answers about your company."}
              </p>
            </div>

            {businessContext && (
              <div className="glass rounded-2xl p-5 mb-5 border border-primary/20">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-sm uppercase tracking-wider text-text-muted">
                    What we learned about {orgData.name || "your business"}
                  </h2>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 mb-3">
                  <div className="rounded-lg bg-surface/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-text-muted">Stage</div>
                    <div className="text-sm font-medium capitalize">
                      {businessContext.stage.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-text-muted">
                      Business model
                    </div>
                    <div className="text-sm font-medium">{businessContext.business_model}</div>
                  </div>
                </div>
                <div className="rounded-lg bg-surface/60 px-3 py-2 mb-3">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Primary growth lever
                  </div>
                  <div className="text-sm font-medium">{businessContext.primary_growth_lever}</div>
                </div>
                {businessContext.key_risks.length > 0 && (
                  <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-amber-400 flex items-center gap-1 mb-1">
                      <AlertTriangle className="w-3 h-3" /> Key risks
                    </div>
                    <ul className="text-xs space-y-1">
                      {businessContext.key_risks.map((r, i) => (
                        <li key={i} className="text-text-muted">
                          • {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="glass rounded-2xl p-5 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  Add your business context
                </h3>
              </div>
              <p className="text-xs text-text-muted mb-3">
                Choose how you want to share your business context. The AI will analyse whatever
                you provide.
              </p>
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-surface border border-border mb-4">
                <button
                  onClick={() => setDocInputMode("upload")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    docInputMode === "upload"
                      ? "bg-primary text-white"
                      : "text-text-muted hover:text-foreground"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5 inline mr-1.5" />
                  Upload files
                </button>
                <button
                  onClick={() => setDocInputMode("text")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    docInputMode === "text"
                      ? "bg-primary text-white"
                      : "text-text-muted hover:text-foreground"
                  }`}
                >
                  <Type className="w-3.5 h-3.5 inline mr-1.5" />
                  Type details
                </button>
              </div>

              {docInputMode === "upload" ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl border-2 border-dashed border-border p-8 text-center cursor-pointer hover:border-primary transition-colors bg-surface/40"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png,.txt,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Upload className="w-10 h-10 text-text-muted mx-auto mb-3" />
                  <p className="font-medium mb-1">Drop files here or click to upload</p>
                  <p className="text-sm text-text-muted">
                    PDF, Excel, Word, Images, CSV, TXT (max 25MB each)
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-border p-4 bg-surface/40">
                  <div className="flex items-start gap-2 mb-2">
                    <PencilLine className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Describe your business in your own words</p>
                      <p className="text-xs text-text-muted mt-0.5">
                        Paste notes, summaries, or bullet points. The AI will read it just like an
                        uploaded document.
                      </p>
                    </div>
                  </div>
                  <textarea
                    value={docTextInput}
                    onChange={(e) => {
                      setDocTextInput(e.target.value);
                      if (docTextError) setDocTextError("");
                      if (docTextSubmitted) setDocTextSubmitted(false);
                    }}
                    placeholder="e.g. We are a B2B SaaS for dentists. Founded 2021, ~$1.2M ARR, 12 customers, two co-founders, three engineers. Our pricing is per-seat, $99/mo for the starter and $399/mo for the pro plan..."
                    rows={6}
                    className="w-full mt-3 px-3 py-2.5 rounded-xl bg-surface border border-border text-sm focus:border-primary focus:outline-none resize-y min-h-[140px]"
                  />
                  {docTextError && (
                    <p className="text-xs text-rose-400 mt-2">{docTextError}</p>
                  )}
                  {docTextSubmitted && !docTextError && (
                    <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Submitted — AI is analysing your notes
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[10px] text-text-muted">
                      {docTextInput.length} characters
                    </span>
                    <button
                      onClick={handleTextSubmit}
                      disabled={docTextSubmitting || docTextInput.trim().length < 50}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-light text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {docTextSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Submit for AI analysis
                    </button>
                  </div>
                </div>
              )}
            </div>

            {uploadedFiles.length > 0 && (
              <div className="space-y-3 mb-5">
                {uploadedFiles.map((file, i) => (
                  <div
                    key={i}
                    className="glass rounded-xl p-4 flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      {file.processed && file.aiStatus === "completed" ? (
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      ) : file.processed && file.aiStatus === "failed" ? (
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                      ) : (
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-text-muted flex items-center gap-1">
                        {!file.processed
                          ? "Uploading..."
                          : file.aiStatus === "failed"
                          ? "Upload complete — AI analysis will retry later"
                          : "Uploaded — AI is analyzing for your dashboard"}
                      </p>
                    </div>
                    <button onClick={() => removeFile(i)} className="cursor-pointer">
                      <X className="w-4 h-4 text-text-muted hover:text-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="glass rounded-2xl p-5 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Documents that drive growth
                </h3>
                {suggestionsLoading && (
                  <Loader2 className="w-4 h-4 text-text-muted animate-spin" />
                )}
              </div>
              <p className="text-xs text-text-muted mb-3">
                Each suggestion is tailored to your stage, model, and industry. You can
                download a Word template, fill it in, and upload it back — or paste the
                same info in the text box above.
              </p>
              <div className="space-y-2">
                {docSuggestions.length === 0 && !suggestionsLoading && (
                  <div className="text-sm text-text-muted italic">
                    Add a website URL or industry to unlock tailored suggestions.
                  </div>
                )}
                {docSuggestions.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-border bg-surface/40 p-3 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{s.title}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                              s.priority === "high"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : s.priority === "medium"
                                ? "bg-cyan-500/15 text-cyan-400"
                                : "bg-text-muted/15 text-text-muted"
                            }`}
                          >
                            {s.priority}
                          </span>
                          <span className="text-[10px] text-text-muted capitalize">
                            {s.category.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted mt-1">{shorten(s.why_it_helps, 70)}</p>
                        {s.example_contents && (
                          <p className="text-[11px] text-text-muted/70 mt-1 italic">
                            e.g. {shorten(s.example_contents, 45)}
                          </p>
                        )}
                        <div className="mt-2">
                          <button
                            onClick={() => handleTemplateDownload(s)}
                            disabled={templateDownloading === s.title}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:border-primary/60 hover:text-primary text-xs font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            title="Download an AI-generated Word template for this document"
                          >
                            {templateDownloading === s.title ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <FileDown className="w-3.5 h-3.5" />
                            )}
                            Download template (.docx)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("org-details")}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={() => setStep("persona-time")}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PERSONA TIME */}
        {step === "persona-time" && (
          <div className="max-w-xl mx-auto text-center">
            <div className="mb-8">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Clock className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-3xl font-bold mb-2">
                We need <span className="gradient-text">~{personaTimeEstimate} minutes</span>
              </h1>
              <p className="text-text-muted">
                Based on our analysis of {orgData.name || "your company"}, a few questions will
                help us understand your leadership style and priorities. This data will personalize
                your dashboard.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handlePersonaTimeNo}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer"
              >
                No, thanks
              </button>
              <button
                onClick={handlePersonaTimeYes}
                disabled={personaLoading}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {personaLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Yes, let&apos;s go
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: PERSONA QUESTION */}
        {step === "persona-question" && currentQuestion && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm mb-4">
                <Sparkles className="w-4 h-4" />
                Question {currentQuestion.question_number}
              </div>
              <h1 className="text-2xl font-bold mb-2">{currentQuestion.question}</h1>
            </div>

            <div className="space-y-3 mb-8">
              {currentQuestion.options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => handlePersonaAnswer(option)}
                  className="w-full p-4 rounded-xl glass hover:bg-primary/10 hover:border-primary text-left transition-all cursor-pointer border border-transparent"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium text-sm">
                      {i + 1}
                    </div>
                    <span className="font-medium">{option}</span>
                  </div>
                </button>
              ))}

              <div className="relative">
                <input
                  type="text"
                  value={personaCustomAnswer}
                  onChange={(e) => setPersonaCustomAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && personaCustomAnswer.trim()) {
                      handlePersonaAnswer(personaCustomAnswer.trim());
                    }
                  }}
                  placeholder="Or write your own answer..."
                  className="w-full px-4 py-4 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                />
                <button
                  onClick={() => {
                    if (personaCustomAnswer.trim()) {
                      handlePersonaAnswer(personaCustomAnswer.trim());
                    }
                  }}
                  disabled={!personaCustomAnswer.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-light text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
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
                onClick={handlePersonaTimeNo}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer"
              >
                Skip to dashboard
              </button>
            </div>
          </div>
        )}

        {step === "persona-question" && personaLoading && (
          <div className="max-w-xl mx-auto text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-text-muted">Generating next question...</p>
          </div>
        )}

        {/* STEP 6: PERSONA MORE TIME */}
        {step === "persona-more-time" && (
          <div className="max-w-xl mx-auto text-center">
            <div className="mb-8">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Clock className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-3xl font-bold mb-2">
                Do you have <span className="gradient-text">more time</span>?
              </h1>
              <p className="text-text-muted">
                We&apos;ve learned a lot so far! Would you like to answer a few more questions to
                help YesBoss understand your company even better?
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handlePersonaMoreTimeNo}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer"
              >
                No, thanks
              </button>
              <button
                onClick={handlePersonaMoreTimeYes}
                disabled={personaLoading}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {personaLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Yes, continue
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      {/* STEP 7: GOALS — removed; default goals auto-generated by backend on org creation */}
        </>)}
      </div>

      {showDuplicatePrompt && !requestSent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="max-w-md w-full mx-4 glass rounded-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Domain Already Registered</h2>
            <p className="text-text-muted text-sm mb-1">
              The domain{" "}
              <span className="font-semibold text-foreground">{orgData.domain}</span> is already
              registered.
            </p>
            <p className="text-text-muted text-sm mb-2">
              Send a request to join as a co-owner?
            </p>
            {primaryOwnerInfo ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface/50 border border-border mb-4 text-left">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                  {(primaryOwnerInfo.full_name || primaryOwnerInfo.email)[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{primaryOwnerInfo.full_name || "Primary Owner"}</p>
                  <p className="text-xs text-text-muted truncate">{primaryOwnerInfo.email}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium whitespace-nowrap">Owner</span>
              </div>
            ) : (
              <p className="text-xs text-text-muted/60 mb-4">Request will be sent to the organization owner.</p>
            )}
            {requestError && (
              <p className="text-sm text-red-400 mb-4">{requestError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleDuplicateNo}
                disabled={signingOut || joiningOrg}
                className="flex-1 py-3 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {signingOut ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  "Use different email"
                )}
              </button>
              <button
                onClick={handleRequestOwner}
                disabled={joiningOrg || signingOut}
                className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {joiningOrg ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Send Request"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {requestSent && (
        <div className="max-w-md mx-auto text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Send className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">Request Sent</h2>
          <p className="text-text-muted text-sm mb-2">
            Your request to join as a co-owner has been sent to the primary owner for approval.
          </p>
          <p className="text-text-muted text-sm mb-6">
            You'll receive an email once your request is approved or declined.
          </p>
          {requestStatus === "approved" ? (
            <p className="text-green-400 font-medium mb-4">Approved! Redirecting...</p>
          ) : requestStatus === "rejected" ? (
            <p className="text-red-400 font-medium mb-4">Your request was declined.</p>
          ) : (
            <>
              <p className="text-xs text-text-muted/60 mb-4">
                Status: {requestStatus === "pending" ? "Waiting for approval..." : requestStatus || "Sending request..."}
              </p>
              <button
                onClick={handleCheckRequestStatus}
                disabled={checkingStatus}
                className="py-3 px-6 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 mx-auto"
              >
                {checkingStatus ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Check Status"
                )}
              </button>
              {requestError && (
                <p className="text-xs text-red-400 mt-4">{requestError}</p>
              )}
              <button
                onClick={handleResendRequest}
                disabled={joiningOrg}
                className="mt-3 py-2 px-4 rounded-lg glass hover:bg-surface-light text-text-muted text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
              >
                {joiningOrg ? (
                  <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                ) : null}
                Resend Request
              </button>
            </>
          )}
        </div>
      )}

      {duplicateChecking && !showDuplicatePrompt && !requestSent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md">
          <div className="glass rounded-2xl p-8 text-center max-w-sm mx-4">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-1">Scanning your domain</h3>
            <p className="text-sm text-text-muted">Checking if your company is already registered...</p>
          </div>
        </div>
      )}
    </div>
  );
}
