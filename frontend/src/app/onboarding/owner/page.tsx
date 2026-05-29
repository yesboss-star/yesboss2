"use client";

import { Suspense, useState, useRef, useEffect } from "react";
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
  Target,
  Plus,
  UserPlus,
  Trash2,
  Lightbulb,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

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
  "icloud.com",
];

const isPersonalEmailDomain = (domain: string): boolean => {
  const cleanDomain = domain.toLowerCase().trim();
  return PERSONAL_EMAIL_DOMAINS.includes(cleanDomain);
};

type OnboardingStep = "welcome" | "time-request" | "org-details" | "ai-scan" | "file-upload" | "social" | "persona-popup" | "persona-time" | "persona-question" | "persona-more-time" | "goals";

interface OnboardingGoal {
  id: string;
  title: string;
  description: string;
  department: string;
  priority: string;
  assignee_name: string;
  reviewer_name: string;
}

interface PersonaQuestion {
  question: string;
  options: string[];
  time_estimate: number;
  ask_more_time: boolean;
  need_more_time?: boolean;
  question_number: number;
}

interface SocialLink {
  platform: string;
  url: string;
  detected: boolean;
  icon: React.ReactNode;
}

const INDUSTRY_FILE_SUGGESTIONS: Record<string, string[]> = {
  "Technology & Software": [
    "Technical architecture docs",
    "Product roadmaps",
    "Code repositories overview",
    "Tech stack documentation",
    "Software requirements specifications",
    "API documentation",
  ],
  "IT Services & Consulting": [
    "Client project summaries",
    "Service level agreements",
    "Resource allocation plans",
    "Case studies",
    "Consulting frameworks",
  ],
  "Artificial Intelligence & Machine Learning": [
    "Model architecture docs",
    "Training datasets overview",
    "AI ethics guidelines",
    "Performance benchmarks",
    "Research papers",
  ],
  "SaaS / Cloud Computing": [
    "Subscription metrics",
    "Infrastructure diagrams",
    "SLA documents",
    "Customer onboarding guides",
    "Feature release notes",
  ],
  "Cybersecurity": [
    "Security audit reports",
    "Threat assessment docs",
    "Compliance certifications",
    "Incident response plans",
    "Penetration test results",
  ],
  "E-commerce & Online Retail": [
    "Product catalogs",
    "Sales analytics reports",
    "Customer segmentation data",
    "Inventory management sheets",
    "Return/refund policies",
  ],
  "Fintech & Payment Solutions": [
    "Transaction flow diagrams",
    "Compliance documentation",
    "Security audit reports",
    "User acquisition metrics",
    "Financial projections",
  ],
  "Banking & Financial Services": [
    "Financial statements (P&L, Balance Sheet)",
    "Cash flow reports",
    "Risk assessment documents",
    "Regulatory compliance docs",
    "Customer portfolio data",
  ],
  "Insurance & Risk Management": [
    "Policy documents",
    "Claims processing workflows",
    "Risk assessment models",
    "Actuarial reports",
    "Customer retention data",
  ],
  "Investment & Wealth Management": [
    "Investment portfolios",
    "Market analysis reports",
    "Client financial plans",
    "Performance benchmarks",
    "Regulatory filings",
  ],
  "Healthcare & Life Sciences": [
    "Patient flow diagrams",
    "Staff scheduling templates",
    "Medical inventory records",
    "Compliance documentation",
    "Clinical trial data",
  ],
  "Healthcare Technology (HealthTech)": [
    "EHR integration docs",
    "Telehealth platform specs",
    "HIPAA compliance docs",
    "Patient engagement metrics",
    "Medical device certifications",
  ],
  "Pharmaceuticals & Biotech": [
    "Drug development pipelines",
    "Clinical trial reports",
    "Regulatory submission docs",
    "Manufacturing SOPs",
    "Quality control reports",
  ],
  "Medical Devices & Equipment": [
    "Product specifications",
    "FDA/CE certification docs",
    "Manufacturing processes",
    "Clinical validation reports",
    "Distribution agreements",
  ],
  "Telemedicine & Digital Health": [
    "Platform architecture docs",
    "Patient consent forms",
    "Telehealth guidelines",
    "User engagement metrics",
    "Data privacy policies",
  ],
  "Education & EdTech": [
    "Curriculum documents",
    "Student enrollment data",
    "Teacher/staff schedules",
    "Assessment results",
    "Learning analytics reports",
  ],
  "Online Learning & E-Learning": [
    "Course catalogs",
    "Student engagement metrics",
    "Content development plans",
    "Platform usage analytics",
    "Certification frameworks",
  ],
  "Higher Education": [
    "Academic program docs",
    "Admission statistics",
    "Research publications",
    "Faculty profiles",
    "Accreditation documents",
  ],
  "Training & Development": [
    "Training curriculum",
    "Skill assessment tools",
    "Participant feedback reports",
    "Certification programs",
    "Corporate training plans",
  ],
  "Manufacturing & Industrial": [
    "Production schedules",
    "Quality control reports",
    "Equipment maintenance logs",
    "Supplier/vendor reports",
    "Safety compliance docs",
  ],
  "Automotive & Electric Vehicles": [
    "Vehicle specifications",
    "Supply chain documents",
    "Safety test reports",
    "Manufacturing processes",
    "Regulatory compliance docs",
  ],
  "Aerospace & Defense": [
    "Engineering specifications",
    "Safety certifications",
    "Contract documents",
    "Testing protocols",
    "Compliance reports",
  ],
  "Electronics & Semiconductors": [
    "Circuit designs",
    "Manufacturing specs",
    "Quality assurance reports",
    "Supply chain docs",
    "Product testing results",
  ],
  "Retail & Consumer Goods": [
    "Inventory management sheets",
    "Sales reports",
    "Supplier lists",
    "Customer purchase history",
    "Merchandising plans",
  ],
  "Fashion & Apparel": [
    "Design portfolios",
    "Seasonal collections",
    "Supplier agreements",
    "Sales trend reports",
    "Brand guidelines",
  ],
  "Food & Beverage": [
    "Recipe documentation",
    "Supply chain records",
    "Quality control reports",
    "Nutritional information",
    "Distribution agreements",
  ],
  "Beauty & Cosmetics": [
    "Product formulations",
    "Regulatory compliance docs",
    "Marketing campaigns",
    "Sales analytics",
    "Supplier agreements",
  ],
  "Sports & Fitness": [
    "Training programs",
    "Member analytics",
    "Facility schedules",
    "Equipment inventories",
    "Partnership agreements",
  ],
  "Real Estate & Property": [
    "Property listings",
    "Lease agreements",
    "Maintenance schedules",
    "Tenant records",
    "Market analysis reports",
  ],
  "Construction & Infrastructure": [
    "Project blueprints",
    "Contractor agreements",
    "Safety compliance docs",
    "Budget estimates",
    "Progress reports",
  ],
  "Architecture & Interior Design": [
    "Design portfolios",
    "Project specifications",
    "Client briefs",
    "Material specifications",
    "Budget documents",
  ],
  "Media & Entertainment": [
    "Content calendars",
    "Audience analytics",
    "Campaign performance reports",
    "Content rights documents",
    "Production schedules",
  ],
  "Film & Television": [
    "Production schedules",
    "Script documents",
    "Budget breakdowns",
    "Distribution agreements",
    "Talent contracts",
  ],
  "Music & Audio": [
    "Track catalogs",
    "Licensing agreements",
    "Royalty statements",
    "Production schedules",
    "Artist contracts",
  ],
  "Gaming & Esports": [
    "Game design documents",
    "Player analytics",
    "Monetization strategies",
    "Development roadmaps",
    "Tournament schedules",
  ],
  "Publishing & Content": [
    "Editorial calendars",
    "Content guidelines",
    "Readership analytics",
    "Author contracts",
    "Distribution plans",
  ],
  "Advertising & Marketing": [
    "Campaign briefs",
    "Client portfolios",
    "Performance reports",
    "Media buying plans",
    "Creative assets",
  ],
  "Digital Marketing & SEO": [
    "SEO audit reports",
    "Content calendars",
    "Campaign analytics",
    "Keyword research docs",
    "Client case studies",
  ],
  "Public Relations & Communications": [
    "Press release archives",
    "Media coverage reports",
    "Crisis communication plans",
    "Client portfolios",
    "Stakeholder maps",
  ],
  "Logistics & Supply Chain": [
    "Route maps",
    "Fleet management data",
    "Shipping manifests",
    "Warehouse inventory",
    "Vendor contracts",
  ],
  "Transportation & Mobility": [
    "Fleet schedules",
    "Route optimization docs",
    "Maintenance logs",
    "Regulatory compliance",
    "Customer analytics",
  ],
  "Travel & Tourism": [
    "Booking analytics",
    "Destination guides",
    "Vendor agreements",
    "Customer feedback reports",
    "Seasonal pricing strategies",
  ],
  "Hospitality & Hotels": [
    "Occupancy reports",
    "Guest feedback data",
    "Staff schedules",
    "Vendor contracts",
    "Revenue management docs",
  ],
  "Restaurants & Food Services": [
    "Menu documentation",
    "Supplier agreements",
    "Health inspection reports",
    "Staff schedules",
    "Sales analytics",
  ],
  "Legal Services & Law": [
    "Case files",
    "Legal research docs",
    "Client agreements",
    "Compliance checklists",
    "Court filing templates",
  ],
  "Accounting & Taxation": [
    "Financial statements",
    "Tax filing documents",
    "Audit reports",
    "Client portfolios",
    "Compliance checklists",
  ],
  "HR & Recruitment": [
    "Job descriptions",
    "Candidate pipelines",
    "Interview frameworks",
    "Employee handbooks",
    "Compensation benchmarks",
  ],
  "Staffing & Outsourcing": [
    "Client requirements docs",
    "Candidate databases",
    "Service level agreements",
    "Billing schedules",
    "Quality metrics",
  ],
  "Non-profit & NGO": [
    "Grant applications",
    "Impact reports",
    "Donor databases",
    "Program evaluations",
    "Financial statements",
  ],
  "Government & Public Sector": [
    "Policy documents",
    "Budget allocations",
    "Public records",
    "Compliance reports",
    "Service delivery metrics",
  ],
  "Energy & Utilities": [
    "Infrastructure maps",
    "Consumption reports",
    "Regulatory filings",
    "Maintenance schedules",
    "Environmental impact docs",
  ],
  "Oil & Gas": [
    "Exploration reports",
    "Production data",
    "Safety compliance docs",
    "Environmental assessments",
    "Supply chain docs",
  ],
  "Renewable Energy & Sustainability": [
    "Project feasibility studies",
    "Environmental impact docs",
    "Energy production data",
    "Regulatory permits",
    "Investment proposals",
  ],
  "Agriculture & AgTech": [
    "Crop management plans",
    "Soil analysis reports",
    "Supply chain docs",
    "Yield data",
    "Regulatory compliance",
  ],
  "Environment & Climate": [
    "Environmental assessments",
    "Climate data reports",
    "Regulatory filings",
    "Research publications",
    "Conservation plans",
  ],
  "Telecommunications": [
    "Network architecture docs",
    "Service level agreements",
    "Customer analytics",
    "Infrastructure maps",
    "Regulatory compliance",
  ],
  "Broadcasting & Media": [
    "Programming schedules",
    "Audience analytics",
    "Content rights docs",
    "Advertising contracts",
    "Production budgets",
  ],
  "Sports Management": [
    "Athlete contracts",
    "Event schedules",
    "Sponsorship agreements",
    "Performance metrics",
    "Marketing plans",
  ],
  "Event Management": [
    "Event timelines",
    "Vendor contracts",
    "Budget breakdowns",
    "Attendee analytics",
    "Venue specifications",
  ],
  "Non-governmental Organization": [
    "Project proposals",
    "Impact assessments",
    "Donor reports",
    "Financial statements",
    "Compliance documents",
  ],
  "Social Enterprise": [
    "Impact metrics",
    "Business plans",
    "Funding proposals",
    "Community engagement docs",
    "Financial reports",
  ],
  "Research & Development": [
    "Research proposals",
    "Experiment logs",
    "Publication records",
    "Patent applications",
    "Funding documents",
  ],
  "Science & Laboratories": [
    "Lab protocols",
    "Research data",
    "Safety documentation",
    "Equipment inventories",
    "Quality control reports",
  ],
};

const MICRO_VERTICAL_FILE_SUGGESTIONS: Record<string, string[]> = {
  "Custom Software Development": [
    "Software architecture diagrams",
    "Client project portfolios",
    "Development process docs",
    "Technology stack documentation",
    "Client testimonials",
  ],
  "Mobile App Development": [
    "App store listings",
    "UI/UX design files",
    "User analytics reports",
    "App architecture docs",
    "Release notes",
  ],
  "Web Development": [
    "Website architecture docs",
    "Client portfolio sites",
    "Performance reports",
    "SEO audit documents",
    "Design mockups",
  ],
  "Cloud Services & Migration": [
    "Cloud architecture diagrams",
    "Migration plans",
    "Cost optimization reports",
    "Security assessments",
    "SLA documents",
  ],
  "Data Analytics & Business Intelligence": [
    "Dashboard screenshots",
    "Data pipeline docs",
    "Client case studies",
    "Analytics frameworks",
    "Sample reports",
  ],
  "Machine Learning & AI Solutions": [
    "Model architecture docs",
    "Training data samples",
    "Performance benchmarks",
    "Use case documents",
    "AI ethics guidelines",
  ],
  "DevOps & Infrastructure": [
    "CI/CD pipeline docs",
    "Infrastructure diagrams",
    "Monitoring dashboards",
    "Incident response plans",
    "Security policies",
  ],
  "API Development & Integration": [
    "API documentation",
    "Integration guides",
    "Architecture diagrams",
    "Testing reports",
    "Client case studies",
  ],
  "E-commerce Platforms": [
    "Platform feature docs",
    "Merchant onboarding guides",
    "Payment integration docs",
    "Analytics dashboards",
    "Security certifications",
  ],
  "Payment Processing": [
    "Payment flow diagrams",
    "Security certifications",
    "Compliance documents",
    "Transaction reports",
    "Integration guides",
  ],
  "Digital Marketing": [
    "Campaign portfolios",
    "ROI reports",
    "Content calendars",
    "Client case studies",
    "Analytics dashboards",
  ],
  "Content Management Systems": [
    "CMS architecture docs",
    "Plugin/extension docs",
    "User guides",
    "Security assessments",
    "Performance benchmarks",
  ],
  "Project Management Tools": [
    "Feature documentation",
    "User guides",
    "Integration docs",
    "Customer feedback",
    "Roadmap documents",
  ],
  "Customer Relationship Management (CRM)": [
    "CRM workflow docs",
    "Integration guides",
    "Customer journey maps",
    "Analytics reports",
    "Security certifications",
  ],
  "Enterprise Resource Planning (ERP)": [
    "Module documentation",
    "Implementation guides",
    "Integration specs",
    "Client case studies",
    "Security assessments",
  ],
  "Human Resources (HR) Software": [
    "Feature documentation",
    "Compliance guides",
    "Integration docs",
    "User manuals",
    "Security certifications",
  ],
  "Telehealth & Remote Care": [
    "Platform architecture docs",
    "HIPAA compliance docs",
    "Patient flow diagrams",
    "Security assessments",
    "User guides",
  ],
  "Electronic Health Records (EHR)": [
    "EHR system specs",
    "Interoperability docs",
    "Compliance certifications",
    "Data migration plans",
    "User training materials",
  ],
  "Medical Imaging & Diagnostics": [
    "Imaging protocols",
    "Diagnostic accuracy reports",
    "Regulatory approvals",
    "Integration guides",
    "Clinical validation docs",
  ],
  "Drug Discovery & Research": [
    "Research protocols",
    "Clinical trial data",
    "Regulatory submissions",
    "Lab notebooks",
    "Patent applications",
  ],
  "Online Education Platforms": [
    "Course catalogs",
    "Student analytics",
    "Content development plans",
    "Platform architecture docs",
    "User engagement reports",
  ],
  "Corporate Training": [
    "Training curriculum",
    "Assessment tools",
    "Participant feedback",
    "ROI reports",
    "Certification frameworks",
  ],
  "Skill Development": [
    "Skill frameworks",
    "Learning paths",
    "Assessment tools",
    "Progress tracking docs",
    "Certification programs",
  ],
  "Fintech Solutions": [
    "Product documentation",
    "Security audits",
    "Compliance certifications",
    "User acquisition data",
    "Financial projections",
  ],
  "Blockchain & Crypto": [
    "Whitepapers",
    "Smart contract audits",
    "Tokenomics docs",
    "Security assessments",
    "Technical architecture",
  ],
  "Insurtech": [
    "Product documentation",
    "Underwriting guidelines",
    "Claims processing flows",
    "Compliance docs",
    "Customer analytics",
  ],
  "Supply Chain Management": [
    "Supply chain maps",
    "Vendor contracts",
    "Inventory reports",
    "Logistics optimization docs",
    "Risk assessments",
  ],
  "Warehouse Management": [
    "Warehouse layouts",
    "Inventory reports",
    "Process documentation",
    "Equipment specs",
    "Safety protocols",
  ],
  "Fleet Management": [
    "Fleet inventory",
    "Maintenance schedules",
    "Route optimization docs",
    "Driver management policies",
    "Compliance reports",
  ],
  "Last Mile Delivery": [
    "Delivery route maps",
    "Driver schedules",
    "Customer feedback data",
    "Performance metrics",
    "Technology integration docs",
  ],
  "Social Media & Networking": [
    "Platform architecture docs",
    "User growth metrics",
    "Content moderation policies",
    "Engagement analytics",
    "Monetization strategies",
  ],
  "Video Streaming & OTT": [
    "Content library docs",
    "Streaming architecture",
    "User analytics",
    "Content licensing agreements",
    "Monetization plans",
  ],
  "Online Gaming": [
    "Game design documents",
    "Player analytics",
    "Monetization strategies",
    "Technical architecture",
    "Community guidelines",
  ],
  "Virtual Reality (VR) & Augmented Reality (AR)": [
    "Experience design docs",
    "Technical specifications",
    "User testing reports",
    "Hardware requirements",
    "Content pipelines",
  ],
  "Internet of Things (IoT)": [
    "Device specifications",
    "Network architecture",
    "Security protocols",
    "Data flow diagrams",
    "Use case documents",
  ],
  "Robotics & Automation": [
    "Robot specifications",
    "Integration guides",
    "Safety protocols",
    "Performance benchmarks",
    "Use case documents",
  ],
  "Electric Vehicles & Charging": [
    "Vehicle specifications",
    "Charging infrastructure docs",
    "Battery technology docs",
    "Regulatory compliance",
    "Market analysis",
  ],
  "Smart Buildings & Homes": [
    "System architecture docs",
    "Device integration guides",
    "Security protocols",
    "User manuals",
    "Energy efficiency reports",
  ],
  "Clean Energy Solutions": [
    "Project feasibility studies",
    "Energy production data",
    "Environmental impact docs",
    "Regulatory permits",
    "Investment proposals",
  ],
  "Waste Management": [
    "Collection schedules",
    "Processing facility docs",
    "Environmental compliance",
    "Recycling reports",
    "Equipment inventories",
  ],
  "Water Treatment": [
    "Treatment process docs",
    "Quality testing reports",
    "Infrastructure maps",
    "Regulatory compliance",
    "Environmental impact docs",
  ],
  "Agriculture Technology": [
    "Crop management plans",
    "Sensor data reports",
    "Yield predictions",
    "Equipment specifications",
    "Market analysis",
  ],
  "Food Technology": [
    "Product formulations",
    "Quality control reports",
    "Supply chain docs",
    "Regulatory compliance",
    "Market research",
  ],
  "B2B Services": [
    "Service catalogs",
    "Client case studies",
    "SLA documents",
    "Pricing strategies",
    "Partnership agreements",
  ],
  "B2C Services": [
    "Product catalogs",
    "Customer analytics",
    "Marketing plans",
    "Sales reports",
    "User feedback data",
  ],
  "Marketplace & Platforms": [
    "Platform architecture docs",
    "Seller onboarding guides",
    "Transaction flow docs",
    "Trust & safety policies",
    "Growth metrics",
  ],
  "Subscription Services": [
    "Subscription plans",
    "Churn analysis reports",
    "Customer lifecycle docs",
    "Revenue metrics",
    "Feature roadmaps",
  ],
  "Managed Services": [
    "Service catalogs",
    "SLA documents",
    "Monitoring reports",
    "Client onboarding guides",
    "Security policies",
  ],
  "Consulting & Advisory": [
    "Consulting frameworks",
    "Client deliverables",
    "Case studies",
    "Industry reports",
    "Methodology documents",
  ],
};

const ALL_INDUSTRIES = [
  "Technology & Software",
  "IT Services & Consulting",
  "Artificial Intelligence & Machine Learning",
  "SaaS / Cloud Computing",
  "Cybersecurity",
  "E-commerce & Online Retail",
  "Fintech & Payment Solutions",
  "Banking & Financial Services",
  "Insurance & Risk Management",
  "Investment & Wealth Management",
  "Healthcare & Life Sciences",
  "Healthcare Technology (HealthTech)",
  "Pharmaceuticals & Biotech",
  "Medical Devices & Equipment",
  "Telemedicine & Digital Health",
  "Education & EdTech",
  "Online Learning & E-Learning",
  "Higher Education",
  "Training & Development",
  "Manufacturing & Industrial",
  "Automotive & Electric Vehicles",
  "Aerospace & Defense",
  "Electronics & Semiconductors",
  "Retail & Consumer Goods",
  "Fashion & Apparel",
  "Food & Beverage",
  "Beauty & Cosmetics",
  "Sports & Fitness",
  "Real Estate & Property",
  "Construction & Infrastructure",
  "Architecture & Interior Design",
  "Media & Entertainment",
  "Film & Television",
  "Music & Audio",
  "Gaming & Esports",
  "Publishing & Content",
  "Advertising & Marketing",
  "Digital Marketing & SEO",
  "Public Relations & Communications",
  "Logistics & Supply Chain",
  "Transportation & Mobility",
  "Travel & Tourism",
  "Hospitality & Hotels",
  "Restaurants & Food Services",
  "Legal Services & Law",
  "Accounting & Taxation",
  "HR & Recruitment",
  "Staffing & Outsourcing",
  "Non-profit & NGO",
  "Government & Public Sector",
  "Energy & Utilities",
  "Oil & Gas",
  "Renewable Energy & Sustainability",
  "Agriculture & AgTech",
  "Environment & Climate",
  "Telecommunications",
  "Broadcasting & Media",
  "Sports Management",
  "Event Management",
  "Non-governmental Organization",
  "Social Enterprise",
  "Research & Development",
  "Science & Laboratories",
];

const COMMON_MICRO_VERTICALS = [
  "Custom Software Development",
  "Mobile App Development",
  "Web Development",
  "Cloud Services & Migration",
  "Data Analytics & Business Intelligence",
  "Machine Learning & AI Solutions",
  "DevOps & Infrastructure",
  "API Development & Integration",
  "E-commerce Platforms",
  "Payment Processing",
  "Digital Marketing",
  "Content Management Systems",
  "Project Management Tools",
  "Customer Relationship Management (CRM)",
  "Enterprise Resource Planning (ERP)",
  "Human Resources (HR) Software",
  "Telehealth & Remote Care",
  "Electronic Health Records (EHR)",
  "Medical Imaging & Diagnostics",
  "Drug Discovery & Research",
  "Online Education Platforms",
  "Corporate Training",
  "Skill Development",
  "Fintech Solutions",
  "Blockchain & Crypto",
  "Insurtech",
  "Supply Chain Management",
  "Warehouse Management",
  "Fleet Management",
  "Last Mile Delivery",
  "Social Media & Networking",
  "Video Streaming & OTT",
  "Online Gaming",
  "Virtual Reality (VR) & Augmented Reality (AR)",
  "Internet of Things (IoT)",
  "Robotics & Automation",
  "Electric Vehicles & Charging",
  "Smart Buildings & Homes",
  "Clean Energy Solutions",
  "Waste Management",
  "Water Treatment",
  "Agriculture Technology",
  "Food Technology",
  "B2B Services",
  "B2C Services",
  "Marketplace & Platforms",
  "Subscription Services",
  "Managed Services",
  "Consulting & Advisory",
];

export default function OwnerOnboarding() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="text-text-muted">Loading...</div></div>}>
      <OwnerOnboardingContent />
    </Suspense>
  );
}

function OwnerOnboardingContent() {
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

  const [personaTimeEstimate, setPersonaTimeEstimate] = useState(3);
  const [currentQuestion, setCurrentQuestion] = useState<PersonaQuestion | null>(null);
  const [personaAnswers, setPersonaAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [personaCustomAnswer, setPersonaCustomAnswer] = useState("");
  const [personaLoading, setPersonaLoading] = useState(false);
  const [onboardingGoals, setOnboardingGoals] = useState<OnboardingGoal[]>([]);
  const [goalInput, setGoalInput] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [aiGoalSuggestions, setAiGoalSuggestions] = useState<{ title: string; description: string; department: string; priority: string }[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [savingGoals, setSavingGoals] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [aiTimeMinutes] = useState<number>(2);
  const [analyzingIndustry, setAnalyzingIndustry] = useState(false);
  const [domainAnalyzed, setDomainAnalyzed] = useState(false);
  const [companySuggestions, setCompanySuggestions] = useState<{name: string; domain?: string; industry?: string; website_url?: string; micro_vertical?: string}[]>([]);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [industryInput, setIndustryInput] = useState("");
  const [microVerticalInput, setMicroVerticalInput] = useState("");
  const [showIndustrySuggestions, setShowIndustrySuggestions] = useState(false);
  const [showMicroVerticalSuggestions, setShowMicroVerticalSuggestions] = useState(false);

  const [existingOrg, setExistingOrg] = useState<any>(null);
  const [showDuplicatePrompt, setShowDuplicatePrompt] = useState(false);
  const [showDuplicateNoHint, setShowDuplicateNoHint] = useState(false);
  const [duplicateChecking, setDuplicateChecking] = useState(false);

  const [orgData, setOrgData] = useState({
    name: "",
    domain: "",
    website_url: "",
    industries: [] as string[],
    size: "1-10",
    micro_vertical: "",
    micro_verticals: [] as string[],
  });

  const analyzeIndustryFromDomain = async (domain: string) => {
    setAnalyzingIndustry(true);
    try {
      const response = await fetch(`${API_URL}/intelligence/analyze/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      
      if (response.ok) {
        const responseData = await response.json();
        console.log("API Response:", responseData);
        
        const data = responseData.profile || responseData;
        
        if (data) {
          const detectedIndustry = data.industry || "";
          const detectedMicroVerticals = data.micro_verticals || (data.micro_vertical ? [data.micro_vertical] : []);
          const detectedIndustries = detectedIndustry ? [detectedIndustry] : [];
          
          setOrgData(prev => ({
            ...prev,
            name: data.company_name || prev.name,
            domain: domain,
            website_url: data.website_url || `https://${domain}`,
            industries: detectedIndustries,
            size: data.size || prev.size || "1-10",
            micro_verticals: detectedMicroVerticals,
            micro_vertical: detectedMicroVerticals[0] || "",
          }));
          
          console.log("Setting industry:", detectedIndustry, "micro_verticals:", detectedMicroVerticals);
          setDomainAnalyzed(true);
        }
      }
    } catch (error) {
      console.error("Failed to analyze industry:", error);
    } finally {
      setAnalyzingIndustry(false);
    }
  };

  useEffect(() => {
    if (userEmail) {
      const extractedDomain = userEmail.split("@")[1] || "";
      if (extractedDomain && extractedDomain !== orgData.domain) {
        setOrgData(prev => ({ ...prev, domain: extractedDomain }));
        if (!isPersonalEmailDomain(extractedDomain)) {
          analyzeIndustryFromDomain(extractedDomain);
          setDuplicateChecking(true);
          fetch(`${API_URL}/organizations/by-domain/${encodeURIComponent(extractedDomain)}`)
            .then(r => r.json())
            .then(data => {
              if (data?.organization?._id) {
                setExistingOrg(data.organization);
                setShowDuplicatePrompt(true);
              }
            })
            .catch(() => {})
            .finally(() => setDuplicateChecking(false));
        }
      }
    }
  }, [userEmail]);

  const searchCompanySuggestions = async (query: string) => {
    if (query.length < 2) {
      setCompanySuggestions([]);
      setShowCompanyDropdown(false);
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/intelligence/company/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: query }),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("Company search response:", data);
        
        if (data.name && data.name !== "Not Found" && !data.not_found) {
          const suggestions = [];
          if (data.name) suggestions.push(data);
          if (data.suggested_companies && Array.isArray(data.suggested_companies)) {
            suggestions.push(...data.suggested_companies);
          }
          
          if (suggestions.length > 0) {
            setCompanySuggestions(suggestions.slice(0, 5));
            setShowCompanyDropdown(true);
          } else {
            setCompanySuggestions([]);
            setShowCompanyDropdown(false);
          }
        } else {
          setCompanySuggestions([]);
          setShowCompanyDropdown(false);
        }
      } else {
        console.error("API error:", response.status);
        setCompanySuggestions([]);
      }
    } catch (error) {
      console.error("Failed to search company:", error);
      setCompanySuggestions([]);
    }
  };

  const handleCompanySelect = (company: {name: string; domain?: string; industry?: string; website_url?: string; micro_vertical?: string; micro_verticals?: string[]; size?: string}) => {
    let domain = company.domain || "";
    if (domain && !domain.startsWith("http")) {
      domain = `https://${domain}`;
    }
    
    const companyIndustries = company.industry ? [company.industry] : [];
    const companyMicroVerticals = company.micro_verticals || (company.micro_vertical ? [company.micro_vertical] : []);
    
    setOrgData(prev => ({
      ...prev,
      name: company.name || prev.name,
      domain: company.domain || prev.domain,
      website_url: company.website_url || domain || prev.website_url,
      industries: companyIndustries.length > 0 ? companyIndustries : prev.industries,
      size: company.size || prev.size || "1-10",
      micro_verticals: companyMicroVerticals.length > 0 ? companyMicroVerticals : prev.micro_verticals,
      micro_vertical: companyMicroVerticals[0] || prev.micro_vertical,
    }));
    
    setShowCompanyDropdown(false);
    setCompanySuggestions([]);
    setIndustryInput("");
    setMicroVerticalInput("");
    if (company.domain || company.website_url) {
      setDomainAnalyzed(true);
    }
  };

  const processDomain = (domain: string) => {
    let processed = domain.trim().toLowerCase();
    if (processed.startsWith("http://")) processed = processed.replace("http://", "");
    if (processed.startsWith("https://")) processed = processed.replace("https://", "");
    if (processed.startsWith("www.")) processed = processed.replace("www.", "");
    return processed.split("/")[0];
  };

  const getFileSuggestions = () => {
    const industry = orgData.industries[0] || "Technology & Software";
    const microVertical = orgData.micro_verticals[0] || "";
    
    const industrySuggestions = INDUSTRY_FILE_SUGGESTIONS[industry] || INDUSTRY_FILE_SUGGESTIONS["Technology & Software"];
    const microVerticalSuggestions = microVertical ? (MICRO_VERTICAL_FILE_SUGGESTIONS[microVertical] || []) : [];
    
    const combined = [...microVerticalSuggestions, ...industrySuggestions];
    return [...new Set(combined)].slice(0, 8);
  };

  const addIndustry = (industry: string) => {
    if (industry && !orgData.industries.includes(industry)) {
      setOrgData(prev => ({
        ...prev,
        industries: [...prev.industries, industry],
      }));
    }
    setIndustryInput("");
    setShowIndustrySuggestions(false);
  };

  const removeIndustry = (industry: string) => {
    setOrgData(prev => ({
      ...prev,
      industries: prev.industries.filter(i => i !== industry),
    }));
  };

  const addMicroVertical = (mv: string) => {
    if (!mv || orgData.micro_verticals.some(m => m.toLowerCase() === mv.toLowerCase())) return;
    setOrgData(prev => ({
      ...prev,
      micro_verticals: [...prev.micro_verticals, mv],
      micro_vertical: prev.micro_verticals.length === 0 ? mv : prev.micro_vertical,
    }));
    setMicroVerticalInput("");
    setShowMicroVerticalSuggestions(false);
  };

  const removeMicroVertical = (mv: string) => {
    setOrgData(prev => {
      const filtered = prev.micro_verticals.filter(m => m !== mv);
      return {
        ...prev,
        micro_verticals: filtered,
        micro_vertical: filtered.length > 0 ? filtered[0] : "",
      };
    });
  };

  const getFilteredIndustries = () => {
    if (!industryInput.trim()) return ALL_INDUSTRIES.slice(0, 10);
    const query = industryInput.toLowerCase();
    return ALL_INDUSTRIES.filter(ind => 
      ind.toLowerCase().includes(query) && !orgData.industries.includes(ind)
    ).slice(0, 8);
  };

  const getFilteredMicroVerticals = () => {
    if (!microVerticalInput.trim()) return COMMON_MICRO_VERTICALS.slice(0, 8);
    const query = microVerticalInput.toLowerCase();
    return COMMON_MICRO_VERTICALS.filter(mv => 
      mv.toLowerCase().includes(query) && !orgData.micro_verticals.some(m => m.toLowerCase() === mv.toLowerCase())
    ).slice(0, 8);
  };

  const handleDuplicateYes = async () => {
    if (!existingOrg?._id) return;
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
      setOrganization({
        id: org._id,
        name: org.name,
        domain: org.domain || "",
        industry: org.industry || "",
        size: org.size || "",
        website_url: org.website_url || "",
        createdAt: org.created_at || new Date().toISOString(),
      });
      setOrgId(org._id);
      setShowDuplicatePrompt(false);
      setExistingOrg(null);
      if (domainAnalyzed) {
        setStep("ai-scan");
      } else {
        setStep("file-upload");
      }
    } catch (err) {
      console.error("Failed to join existing org:", err);
      alert("Failed to join organization. Please try again.");
    }
  };

  const handleDuplicateNo = () => {
    setShowDuplicatePrompt(false);
    setShowDuplicateNoHint(true);
  };

  const handleWelcomeContinue = async () => {
    const domain = processDomain(orgData.domain);
    if (domain) {
      setDuplicateChecking(true);
      try {
        const res = await fetch(`${API_URL}/organizations/by-domain/${encodeURIComponent(domain)}`);
        const data = await res.json();
        if (data?.organization?._id) {
          setExistingOrg(data.organization);
          setShowDuplicatePrompt(true);
          setDuplicateChecking(false);
          return;
        }
      } catch {}
      setDuplicateChecking(false);
    }
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
        domain: domain || "",
        industry: orgData.industries[0] || "Technology & Software",
        industries: orgData.industries,
        size: orgData.size || "1-10",
        micro_vertical: orgData.micro_verticals[0] || "",
        micro_verticals: orgData.micro_verticals,
      });
      setOrgId(org.id);
      setStep("file-upload");
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
        industry: orgData.industries[0] || "Technology & Software",
        industries: orgData.industries,
        size: orgData.size || "1-10",
        micro_vertical: orgData.micro_verticals[0] || "",
        micro_verticals: orgData.micro_verticals,
      });
      setOrgId(org.id);
      setOrganization({
        ...org,
        createdAt: org.createdAt,
      });
      if (domainAnalyzed) {
        setStep("ai-scan");
      } else {
        router.push("/dashboard");
      }
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
      const response = await fetch(`${API_URL}/scrape/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });

      const data = await response.json();
      console.log("Scrape response social_links:", data.social_links);
      let socialFromScan = data.social_links || {};
      
      const platforms = [
        { platform: "LinkedIn", url: socialFromScan.linkedin || "", detected: !!socialFromScan.linkedin, icon: <Link2 className="w-5 h-5" /> },
        { platform: "Twitter / X", url: socialFromScan.twitter || "", detected: !!socialFromScan.twitter, icon: <Link2 className="w-5 h-5" /> },
        { platform: "Instagram", url: socialFromScan.instagram || "", detected: !!socialFromScan.instagram, icon: <Link2 className="w-5 h-5" /> },
        { platform: "Facebook", url: socialFromScan.facebook || "", detected: !!socialFromScan.facebook, icon: <Link2 className="w-5 h-5" /> },
        { platform: "YouTube", url: socialFromScan.youtube || "", detected: !!socialFromScan.youtube, icon: <Link2 className="w-5 h-5" /> },
      ];
      setSocialLinksList(platforms);
      console.log("Social links set:", platforms.filter(p => p.url));

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
      formData.append("org_id", orgId || "temp");
      formData.append("user_id", user?.uid || "temp");

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
        } else {
          const errorData = await response.json().catch(() => null);
          console.error("File upload failed:", response.status, errorData);
          setUploadedFiles(prev => 
            prev.map((f, idx) => 
              f.name === file.name ? { ...f, processed: true } : f
            )
          );
        }
      } catch (error) {
        console.error("File upload error:", error);
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

  const handlePersonaStart = () => {
    setStep("persona-popup");
  };

  const handlePersonaPopupYes = () => {
    setStep("persona-time");
  };

  const handlePersonaPopupNo = () => {
    setStep("goals");
  };

  const handlePersonaTimeYes = async () => {
    setPersonaLoading(true);
    try {
      const socialLinks: Record<string, string> = {};
      socialLinksList.forEach(s => { if (s.url) socialLinks[s.platform.toLowerCase().replace(/ \/ x$/, "").replace(/ /g, "_")] = s.url; });
      const response = await fetch(`${API_URL}/chatbot/persona/generate-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgData.name,
          industry: orgData.industries[0] || "",
          micro_vertical: orgData.micro_verticals[0] || "",
          company_size: orgData.size,
          domain: orgData.domain,
          social_links: socialLinks,
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

  const handlePersonaTimeNo = () => {
    setStep("goals");
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
      const socialLinks: Record<string, string> = {};
      socialLinksList.forEach(s => { if (s.url) socialLinks[s.platform.toLowerCase().replace(/ \/ x$/, "").replace(/ /g, "_")] = s.url; });
      const response = await fetch(`${API_URL}/chatbot/persona/generate-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgData.name,
          industry: orgData.industries[0] || "",
          micro_vertical: orgData.micro_verticals[0] || "",
          company_size: orgData.size,
          domain: orgData.domain,
          social_links: socialLinks,
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
          setStep("goals");
        }
      } else {
        setCurrentQuestion(null);
        setStep("goals");
      }
    } catch (error) {
      console.error("Failed to generate next question:", error);
      setCurrentQuestion(null);
      setStep("goals");
    } finally {
      setPersonaLoading(false);
    }
  };

  const handlePersonaMoreTimeYes = async () => {
    setPersonaLoading(true);
    try {
      const socialLinks: Record<string, string> = {};
      socialLinksList.forEach(s => { if (s.url) socialLinks[s.platform.toLowerCase().replace(/ \/ x$/, "").replace(/ /g, "_")] = s.url; });
      const response = await fetch(`${API_URL}/chatbot/persona/generate-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgData.name,
          industry: orgData.industries[0] || "",
          micro_vertical: orgData.micro_verticals[0] || "",
          company_size: orgData.size,
          domain: orgData.domain,
          social_links: socialLinks,
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
      setStep("goals");
    } finally {
      setPersonaLoading(false);
    }
  };

  const handlePersonaMoreTimeNo = () => {
    setStep("goals");
  };

  const goalsFetchedRef = useRef(false);
  const fetchGoalSuggestions = async () => {
    setGoalsLoading(true);
    try {
      const response = await fetch(`${API_URL}/goals/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: orgData.industries[0] || "",
          micro_vertical: orgData.micro_verticals[0] || "",
          count: 6,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setAiGoalSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error("Failed to fetch goal suggestions:", error);
    } finally {
      setGoalsLoading(false);
      goalsFetchedRef.current = true;
    }
  };

  useEffect(() => {
    if (step === "goals" && !goalsFetchedRef.current) {
      goalsFetchedRef.current = true;
      fetchGoalSuggestions().catch(() => {});
    }
    if (step !== "goals") {
      goalsFetchedRef.current = false;
    }
  }, [step]);

  const handleAddGoal = async () => {
    const title = goalInput.trim();
    const description = goalDescription.trim();
    if (!title) return;
    setGoalsLoading(true);
    let department = "";
    try {
      const resp = await fetch(`${API_URL}/goals/analyze-department`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || title,
          industry: orgData.industries[0] || "",
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        department = data.department || "";
      }
    } catch {
      department = "";
    }
    const newGoal: OnboardingGoal = {
      id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      description: description || title,
      department,
      priority: "medium",
      assignee_name: "",
      reviewer_name: "",
    };
    setOnboardingGoals(prev => [...prev, newGoal]);
    setGoalInput("");
    setGoalDescription("");
    setGoalsLoading(false);
  };

  const handleSuggestionClick = (suggestion: { title: string; description: string; department: string; priority: string }) => {
    setOnboardingGoals(prev => [
      ...prev,
      {
        id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: suggestion.title,
        description: suggestion.description,
        department: suggestion.department,
        priority: suggestion.priority,
        assignee_name: "",
        reviewer_name: "",
      },
    ]);
  };

  const handleRemoveGoal = (goalId: string) => {
    setOnboardingGoals(prev => prev.filter(g => g.id !== goalId));
  };

  const handleGoalFieldChange = (goalId: string, field: keyof OnboardingGoal, value: string) => {
    setOnboardingGoals(prev => prev.map(g => (g.id === goalId ? { ...g, [field]: value } : g)));
  };

  const handleGoalsContinue = async () => {
    setSavingGoals(true);
    try {
      const goalsToSave = onboardingGoals.filter(g => g.title.trim());
      for (const goal of goalsToSave) {
        let dept = goal.department;
        if (!dept) {
          try {
            const resp = await fetch(`${API_URL}/goals/analyze-department`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: goal.title,
                description: goal.description,
                industry: orgData.industries[0] || "",
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              dept = data.department || "";
            }
          } catch {}
        }
        await fetch(`${API_URL}/goals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: goal.title,
            description: goal.description,
            department: dept || undefined,
            priority: goal.priority,
            assignee_name: goal.assignee_name || undefined,
            reviewer_name: goal.reviewer_name || undefined,
            organization_id: orgId || undefined,
          }),
        });
      }
    } catch (error) {
      console.error("Failed to save goals:", error);
    } finally {
      setSavingGoals(false);
      const storedUser = localStorage.getItem("yesboss_user");
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        userData.organization_completed = true;
        localStorage.setItem("yesboss_user", JSON.stringify(userData));
        document.cookie = `yesboss_user=${JSON.stringify(userData)}; path=/; max-age=86400; SameSite=Lax`;
      }
      window.location.href = "/dashboard";
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
          context: { industries: orgData.industries, size: orgData.size, micro_vertical: orgData.micro_verticals[0] || "", micro_verticals: orgData.micro_verticals },
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
    const storedUser = localStorage.getItem("yesboss_user");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      userData.organization_completed = true;
      localStorage.setItem("yesboss_user", JSON.stringify(userData));
      document.cookie = `yesboss_user=${JSON.stringify(userData)}; path=/; max-age=86400; SameSite=Lax`;
    }
    window.location.href = "/dashboard";
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
    { id: "persona-popup", label: "Persona", icon: Users },
    { id: "persona-time", label: "Persona", icon: Users },
    { id: "persona-question", label: "Persona", icon: Users },
    { id: "persona-more-time", label: "Persona", icon: Users },
    { id: "goals", label: "Goals", icon: Target },
  ];

  const personaSteps = ["persona-popup", "persona-time", "persona-question", "persona-more-time"];
  const currentStepIndex = personaSteps.includes(step) ? 6 : steps.findIndex((s) => s.id === step);

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
              {!isPersonalEmailDomain(orgData.domain) ? (
                <p className="text-text-muted">
                  We detected your company from your email. Let&apos;s build your AI Business OS.
                </p>
              ) : (
                <p className="text-text-muted">
                  We&apos;ll help you build your AI Business OS. Enter your company website to auto-detect, or skip for manual setup.
                </p>
              )}
            </div>

            {!isPersonalEmailDomain(orgData.domain) ? (
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
            ) : (
              <div className="glass rounded-xl p-6 text-left mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <Building2 className="w-5 h-5 text-primary" />
                  <span className="font-medium">No Company Domain Detected</span>
                </div>
                <p className="text-sm text-text-muted mb-4">
                  You&apos;re using a personal email ({orgData.domain}). That&apos;s fine! Enter your company website below to auto-detect your organization, or skip and add details manually.
                </p>
                <input
                  type="text"
                  value={orgData.domain}
                  onChange={(e) => {
                    let domain = e.target.value;
                    if (!domain.startsWith("http://") && !domain.startsWith("https://") && !domain.startsWith("www.")) {
                      domain = domain.replace(/^(https?:\/\/)?(www\.)?/, "");
                    }
                    setOrgData(prev => ({ ...prev, domain }));
                    if (domain && !isPersonalEmailDomain(domain) && domain.includes(".")) {
                      analyzeIndustryFromDomain(domain);
                    }
                  }}
                  placeholder="Enter your company website (e.g., acme.com)"
                  className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                />
                {analyzingIndustry && (
                  <div className="flex items-center gap-2 mt-3 text-text-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Analyzing your company...</span>
                  </div>
                )}
              </div>
            )}

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
                {domainAnalyzed ? "We auto-detected your company details. You can adjust or add more." : "Enter your company details below."}
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Company Name
                  {domainAnalyzed && <span className="text-emerald-400 text-xs ml-2">(Auto-detected)</span>}
                </label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="text"
                    value={orgData.name}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOrgData(prev => ({ ...prev, name: value }));
                      if (value.length >= 2) {
                        searchCompanySuggestions(value);
                      } else {
                        setCompanySuggestions([]);
                        setShowCompanyDropdown(false);
                      }
                    }}
                    onFocus={() => {
                      if (orgData.name.length >= 2 && companySuggestions.length > 0) {
                        setShowCompanyDropdown(true);
                      }
                    }}
                    placeholder="Start typing company name..."
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                  />
                  {showCompanyDropdown && companySuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                      {companySuggestions.map((company, i) => (
                        <button
                          key={i}
                          onClick={() => handleCompanySelect(company)}
                          className="w-full px-4 py-3 text-left hover:bg-surface-light transition-colors border-b border-border last:border-b-0"
                        >
                          <div className="font-medium text-sm">{company.name}</div>
                          <div className="text-xs text-text-muted flex items-center gap-2">
                            {company.domain && <span>{company.domain}</span>}
                            {company.industry && <span className="text-primary">• {company.industry}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Website URL {domainAnalyzed && <span className="text-emerald-400 text-xs">(Auto-detected)</span>}
                </label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="text"
                    value={orgData.website_url || `https://${orgData.domain}`}
                    onChange={(e) => setOrgData({ ...orgData, website_url: e.target.value })}
                    placeholder="https://www.yourcompany.com"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                  />
                </div>
                <p className="text-xs text-text-muted mt-1">Official company website URL</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Industry {domainAnalyzed && orgData.industries.length > 0 && <span className="text-emerald-400 text-xs ml-2">(Auto-detected)</span>}
                </label>
                <div className="space-y-3">
                  {orgData.industries.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {orgData.industries.map((ind, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm">
                          {ind}
                          <button onClick={() => removeIndustry(ind)} className="hover:bg-primary/20 rounded-full p-0.5 cursor-pointer">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={industryInput}
                        onChange={(e) => {
                          setIndustryInput(e.target.value);
                          setShowIndustrySuggestions(true);
                        }}
                        onFocus={() => setShowIndustrySuggestions(true)}
                        onBlur={() => setTimeout(() => setShowIndustrySuggestions(false), 200)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && industryInput.trim()) {
                            addIndustry(industryInput.trim());
                          }
                        }}
                        placeholder="Type to search or add industry..."
                        className="flex-1 px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                      />
                      <button
                        onClick={() => {
                          if (industryInput.trim()) {
                            addIndustry(industryInput.trim());
                          }
                        }}
                        className="px-4 py-3.5 rounded-xl bg-primary hover:bg-primary-light text-white font-medium transition-colors cursor-pointer"
                      >
                        <span className="text-lg">+</span>
                      </button>
                    </div>
                    {showIndustrySuggestions && getFilteredIndustries().length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                        {getFilteredIndustries().map((ind, i) => (
                          <button
                            key={i}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              addIndustry(ind);
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-surface-light transition-colors border-b border-border last:border-b-0 text-sm cursor-pointer"
                          >
                            {ind}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Micro-Verticals {domainAnalyzed && orgData.micro_verticals.length > 0 && <span className="text-emerald-400 text-xs ml-2">(Auto-detected)</span>}
                </label>
                <div className="space-y-3">
                  {orgData.micro_verticals.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {orgData.micro_verticals.map((mv, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-500 text-sm">
                          {mv}
                          <button onClick={() => removeMicroVertical(mv)} className="hover:bg-purple-500/20 rounded-full p-0.5 cursor-pointer">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={microVerticalInput}
                        onChange={(e) => {
                          setMicroVerticalInput(e.target.value);
                          setShowMicroVerticalSuggestions(true);
                        }}
                        onFocus={() => setShowMicroVerticalSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowMicroVerticalSuggestions(false), 300)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && microVerticalInput.trim()) {
                            addMicroVertical(microVerticalInput.trim());
                          }
                        }}
                        placeholder="e.g., Custom Software, SaaS, AI Solutions..."
                        className="flex-1 px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                      />
                      <button
                        onClick={() => {
                          if (microVerticalInput.trim()) {
                            addMicroVertical(microVerticalInput.trim());
                          }
                        }}
                        className="px-4 py-3.5 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-medium transition-colors cursor-pointer"
                      >
                        <span className="text-lg">+</span>
                      </button>
                    </div>
                    {showMicroVerticalSuggestions && getFilteredMicroVerticals().length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                        {getFilteredMicroVerticals().map((mv, i) => (
                          <button
                            key={i}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              addMicroVertical(mv);
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-surface-light transition-colors border-b border-border last:border-b-0 text-sm cursor-pointer"
                          >
                            {mv}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-text-muted mt-1">Add multiple micro-verticals relevant to your business</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Company Size</label>
                <select
                  value={orgData.size}
                  onChange={(e) => setOrgData({ ...orgData, size: e.target.value })}
                  className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm appearance-none cursor-pointer"
                >
                  <option value="1-10">1-10 employees</option>
                  <option value="11-50">11-50 employees</option>
                  <option value="51-200">51-200 employees</option>
                  <option value="201-500">201-500 employees</option>
                  <option value="500+">500+ employees</option>
                </select>
              </div>

              <button
                onClick={handleOrgDetailsSubmit}
                disabled={!orgData.name}
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
                  onClick={() => setStep("persona-popup")}
                  className="text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  Skip for now →
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 5: FILE UPLOAD (Industry + Micro-Vertical Specific) */}
        {step === "file-upload" && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">
                Upload <span className="gradient-text">{orgData.industries[0] || "your industry"}</span> documents
              </h1>
              <p className="text-text-muted">
                {orgData.micro_verticals.length > 0
                  ? `Based on your industry (${orgData.industries[0] || "Technology"}) and micro-verticals (${orgData.micro_verticals.join(", ")}), we suggest these document types:`
                  : `Based on your industry, we suggest these document types:`
                }
              </p>
            </div>

            <div className="glass rounded-xl p-4 mb-6">
              <h3 className="font-semibold mb-3 text-sm">
                Suggested for {orgData.industries[0] || "your industry"}
                {orgData.micro_verticals.length > 0 ? ` + ${orgData.micro_verticals.join(", ")}` : ""}:
              </h3>
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
                  if (socialLinksList.length === 0) {
                    handleSocialDetection();
                  }
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
                Pre-filled from AI scan. Edit any field to update.
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
                    <input
                      type="text"
                      placeholder={`Add ${social.platform} URL`}
                      value={social.url}
                      onChange={(e) => updateSocialLink(i, e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs focus:border-primary focus:outline-none"
                    />
                  </div>
                  {social.detected && social.url && (
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
                onClick={async () => {
                  const links: Record<string, string> = {};
                  socialLinksList.forEach(s => {
                    if (s.url) {
                      const key = s.platform.toLowerCase().replace(/\s*\/\s*x/i, "_").replace(/\s+/g, "_");
                      links[key] = s.url;
                    }
                  });
                  if (orgId) {
                    try {
                      await fetch(`${API_URL}/organizations/${orgId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ social_links: links }),
                      });
                    } catch {
                      // Silently skip if backend is not available
                    }
                  }
                  setStep("persona-popup");
                }}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 7: PERSONA POPUP */}
        {step === "persona-popup" && (
          <div className="max-w-xl mx-auto text-center">
            <div className="mb-8">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Users className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-3xl font-bold mb-2">
                Do you have <span className="gradient-text">a few minutes</span>?
              </h1>
              <p className="text-text-muted">
                YesBoss has analyzed your company. Would you like to spend a few minutes answering questions so we can understand your company better and create your personalized dashboard?
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handlePersonaPopupNo}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer"
              >
                No, thanks
              </button>
              <button
                onClick={handlePersonaPopupYes}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
              >
                Yes, continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 8: PERSONA TIME REQUEST */}
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
                Based on our analysis of {orgData.name || "your company"}, we need a few minutes to understand your leadership style and priorities. This data will be used to create your personalized dashboard.
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
                {personaLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Yes, let's go"}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 9: PERSONA QUESTION */}
        {step === "persona-question" && currentQuestion && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm mb-4">
                <Sparkles className="w-4 h-4" />
                Question {currentQuestion.question_number}
              </div>
              <h1 className="text-2xl font-bold mb-2">
                {currentQuestion.question}
              </h1>
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
                onClick={() => setStep("social")}
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

        {/* STEP 10: PERSONA MORE TIME */}
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
                We&apos;ve learned a lot so far! Would you like to answer a few more questions to help YesBoss understand your company even better?
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
                {personaLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Yes, continue"}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 11: GOALS */}
        {step === "goals" && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Target className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-3xl font-bold mb-2">
                Set your <span className="gradient-text">goals</span>
              </h1>
              <p className="text-text-muted">
                Define the key goals for your organization. We&apos;ll automatically suggest
                relevant goals based on your industry and assign them to the right departments.
              </p>
            </div>

            {/* Add Goal Form */}
            <div className="glass rounded-xl p-5 mb-6">
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddGoal(); }}
                  placeholder="Enter a goal (e.g., Increase customer retention by 20%)"
                  className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                />
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    value={goalDescription}
                    onChange={(e) => setGoalDescription(e.target.value)}
                    placeholder="Add description (optional)"
                    className="flex-1 px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                  />
                  <button
                    onClick={handleAddGoal}
                    disabled={!goalInput.trim()}
                    className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    <Plus className="w-5 h-5" />
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* AI Suggestions */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-5 h-5 text-amber-400" />
                <h2 className="font-semibold">AI Suggestions</h2>
                {!goalsLoading && (
                  <button
                    onClick={fetchGoalSuggestions}
                    className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-all cursor-pointer ml-auto"
                    title="Refresh suggestions"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </button>
                )}
              </div>
              {goalsLoading && (
                <div className="flex items-center gap-2 text-text-muted py-3">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Generating goal suggestions...</span>
                </div>
              )}
              {!goalsLoading && aiGoalSuggestions.length > 0 && (
                <div className="grid grid-cols-1 gap-2">
                  {aiGoalSuggestions.map((suggestion, i) => {
                    const alreadyAdded = onboardingGoals.some(g => g.title === suggestion.title);
                    return (
                      <button
                        key={i}
                        onClick={() => !alreadyAdded && handleSuggestionClick(suggestion)}
                        disabled={alreadyAdded}
                        className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                          alreadyAdded
                            ? "border-emerald-500/30 bg-emerald-500/5 opacity-60"
                            : "glass hover:bg-primary/10 hover:border-primary border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{suggestion.title}</div>
                            <div className="text-xs text-text-muted mt-0.5">{suggestion.description}</div>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">{suggestion.department}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                suggestion.priority === "high" ? "bg-red-500/15 text-red-400" :
                                suggestion.priority === "medium" ? "bg-amber-500/15 text-amber-400" :
                                "bg-blue-500/15 text-blue-400"
                              }`}>{suggestion.priority}</span>
                            </div>
                          </div>
                          {alreadyAdded ? (
                            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                          ) : (
                            <Plus className="w-5 h-5 text-primary shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Added Goals */}
            {onboardingGoals.length > 0 && (
              <div className="space-y-3 mb-6">
                <h2 className="font-semibold">Your Goals ({onboardingGoals.length})</h2>
                {onboardingGoals.map((goal) => (
                  <div key={goal.id} className="glass rounded-xl p-4 border border-border">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={goal.title}
                          onChange={(e) => handleGoalFieldChange(goal.id, "title", e.target.value)}
                          className="w-full bg-transparent font-medium text-sm border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors"
                        />
                        <input
                          type="text"
                          value={goal.description}
                          onChange={(e) => handleGoalFieldChange(goal.id, "description", e.target.value)}
                          placeholder="Add description..."
                          className="w-full bg-transparent text-xs text-text-muted mt-1 border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors"
                        />
                      </div>
                      <button
                        onClick={() => handleRemoveGoal(goal.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-all cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Department</label>
                        <select
                          value={goal.department}
                          onChange={(e) => handleGoalFieldChange(goal.id, "department", e.target.value)}
                          className="w-full mt-1 px-2 py-1.5 rounded-lg bg-surface border border-border text-xs focus:border-primary focus:outline-none transition-colors cursor-pointer"
                        >
                          <option value="">Auto-assign</option>
                          <option value="Engineering">Engineering</option>
                          <option value="Marketing">Marketing</option>
                          <option value="Sales">Sales</option>
                          <option value="Operations">Operations</option>
                          <option value="Finance">Finance</option>
                          <option value="Human Resources">Human Resources</option>
                          <option value="Product">Product</option>
                          <option value="Design">Design</option>
                          <option value="Customer Support">Customer Support</option>
                          <option value="R&D">R&D</option>
                          <option value="Supply Chain">Supply Chain</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Priority</label>
                        <select
                          value={goal.priority}
                          onChange={(e) => handleGoalFieldChange(goal.id, "priority", e.target.value)}
                          className="w-full mt-1 px-2 py-1.5 rounded-lg bg-surface border border-border text-xs focus:border-primary focus:outline-none transition-colors cursor-pointer"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Assignee</label>
                        <div className="relative mt-1">
                          <UserPlus className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
                          <input
                            type="text"
                            value={goal.assignee_name}
                            onChange={(e) => handleGoalFieldChange(goal.id, "assignee_name", e.target.value)}
                            placeholder="Add person..."
                            className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-surface border border-border text-xs focus:border-primary focus:outline-none transition-colors"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Reviewer</label>
                        <div className="relative mt-1">
                          <UserPlus className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
                          <input
                            type="text"
                            value={goal.reviewer_name}
                            onChange={(e) => handleGoalFieldChange(goal.id, "reviewer_name", e.target.value)}
                            placeholder="Add person..."
                            className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-surface border border-border text-xs focus:border-primary focus:outline-none transition-colors"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {onboardingGoals.length === 0 && aiGoalSuggestions.length === 0 && !goalsLoading && (
              <div className="text-center py-8">
                <p className="text-text-muted text-sm mb-3">
                  Add your own goals above or load AI suggestions based on your industry.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep("social")}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={handleGoalsContinue}
                disabled={savingGoals}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {savingGoals ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}


      </div>

      {showDuplicatePrompt && !showDuplicateNoHint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-w-md w-full mx-4 glass rounded-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Domain Already Registered</h2>
            <p className="text-text-muted text-sm mb-1">
              The domain <span className="font-semibold text-foreground">{orgData.domain}</span> is already registered.
            </p>
            <p className="text-text-muted text-sm mb-6">
              Do you want to continue as an owner of this organization?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDuplicateNoHint(true); }}
                className="flex-1 py-3 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer"
              >
                No, use different domain
              </button>
              <button
                onClick={handleDuplicateYes}
                className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25"
              >
                Yes, continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showDuplicateNoHint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-w-md w-full mx-4 glass rounded-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-rose-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Domain Already Taken</h2>
            <p className="text-text-muted text-sm mb-6">
              This domain is already registered. To create a new organization, please sign out and sign up with a different email address that uses a unique company domain.
            </p>
            <button
              onClick={signOut}
              className="w-full py-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold transition-all cursor-pointer"
            >
              Sign out and try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}