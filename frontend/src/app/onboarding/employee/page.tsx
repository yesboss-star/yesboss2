"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import {
  ArrowRight,
  User,
  Users,
  Building2,
  MessageSquare,
  CheckCircle,
  ArrowLeft,
  Loader2,
  Sparkles,
  Search,
  X,
  GitBranch,
} from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type EmployeeStep = "department" | "org-detect" | "manager" | "hierarchy" | "persona" | "complete";

interface Employee {
  _id: string;
  full_name: string;
  email: string;
  role: string;
  department: string;
  manager_id?: string;
}

interface OrgNode {
  id: string;
  name: string;
  role: string;
  department: string;
  children: OrgNode[];
}

export default function EmployeeOnboarding() {
  const { user, signOut } = useAuth();
  const { setOrganization } = useOrganizationStore();
  const router = useRouter();
  const [step, setStep] = useState<EmployeeStep>("department");
  const [loading, setLoading] = useState(false);

  const [empData, setEmpData] = useState({
    department: "",
    role: "",
    managerId: "",
    managerName: "",
    subordinates: [] as string[],
    orgName: "",
    orgDomain: "",
    orgId: "",
  });

  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [managerSearch, setManagerSearch] = useState("");
  const [managerResults, setManagerResults] = useState<Employee[]>([]);
  const [subordinateSearch, setSubordinateSearch] = useState("");
  const [subordinateResults, setSubordinateResults] = useState<Employee[]>([]);
  const [selectedSubordinates, setSelectedSubordinates] = useState<Employee[]>([]);
  const [orgSearchResults, setOrgSearchResults] = useState<{_id: string; name: string; domain: string; industry: string}[]>([]);
  const [orgSearchLoading, setOrgSearchLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  interface PersonaMessage {
    id: string;
    role: "ai" | "user";
    content: string;
  }
  const [personaMessages, setPersonaMessages] = useState<PersonaMessage[]>([]);
  const [personaInput, setPersonaInput] = useState("");
  const [personaLoading, setPersonaLoading] = useState(false);

  const steps = [
    { id: "department", label: "Department", icon: User },
    { id: "org-detect", label: "Organization", icon: Building2 },
    { id: "manager", label: "Reporting", icon: Users },
    { id: "hierarchy", label: "Team", icon: GitBranch },
    { id: "persona", label: "AI Persona", icon: MessageSquare },
    { id: "complete", label: "Done", icon: CheckCircle },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  useEffect(() => {
    const fetchAISuggestions = async () => {
      try {
        const res = await fetch(`${API_URL}/intelligence/department-suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            email: user?.email, 
            role: empData.role || undefined 
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions?.length) {
            setAiSuggestions(data.suggestions);
          }
        }
      } catch {
        setAiSuggestions([
          "Engineering",
          "Marketing",
          "Sales",
          "Operations",
          "Finance",
          "Human Resources",
        ]);
      }
    };
    if (user?.email || empData.role) {
      fetchAISuggestions();
    }
  }, [user?.email, empData.role]);

  const searchManagers = async (query: string) => {
    setManagerSearch(query);
    if (query.length < 2) {
      setManagerResults([]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/employees?org_id=${empData.orgId}&search=${query}`);
      if (res.ok) {
        const data = await res.json();
        setManagerResults(data.employees || []);
      }
    } catch {
      setManagerResults([]);
    }
  };

  const searchSubordinates = async (query: string) => {
    setSubordinateSearch(query);
    if (query.length < 2) {
      setSubordinateResults([]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/employees?org_id=${empData.orgId}&search=${query}`);
      if (res.ok) {
        const data = await res.json();
        setSubordinateResults(data.employees || []);
      }
    } catch {
      setSubordinateResults([]);
    }
  };

  const handleDetectOrg = async () => {
    setLoading(true);
    try {
      const email = user?.email || "";
      const domain = email.split("@")[1] || "";
      
      const res = await fetch(`${API_URL}/organizations/by-domain/${domain}`);
      if (res.ok) {
        const data = await res.json();
        if (data.organization) {
          setEmpData((prev) => ({
            ...prev,
            orgName: data.organization.name,
            orgDomain: data.organization.domain || domain,
            orgId: data.organization._id,
          }));
        } else {
          setEmpData((prev) => ({
            ...prev,
            orgName: "Acme Corporation",
            orgDomain: domain,
          }));
        }
      } else {
        setEmpData((prev) => ({
          ...prev,
          orgName: "Acme Corporation",
          orgDomain: domain,
        }));
      }
    } catch {
      setEmpData((prev) => ({
        ...prev,
        orgName: "Acme Corporation",
        orgDomain: "acme.com",
      }));
    } finally {
      setLoading(false);
    }
  };

  const buildHierarchy = (employees: Employee[], managerId: string): OrgNode[] => {
    const employeeMap = new Map<string, OrgNode>();
    employees.forEach((emp) => {
      employeeMap.set(emp._id, {
        id: emp._id,
        name: emp.full_name,
        role: emp.role,
        department: emp.department,
        children: [],
      });
    });

    const roots: OrgNode[] = [];
    employees.forEach((emp) => {
      const node = employeeMap.get(emp._id)!;
      if (emp._id === managerId || !emp.manager_id) {
        roots.push(node);
      } else {
        const manager = employeeMap.get(emp.manager_id);
        if (manager) {
          manager.children.push(node);
        } else {
          roots.push(node);
        }
      }
    });

    return roots;
  };

  const searchOrganizations = async (query: string) => {
    if (query.length < 2) {
      setOrgSearchResults([]);
      return;
    }
    setOrgSearchLoading(true);
    try {
      const res = await fetch(`${API_URL}/organizations?search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setOrgSearchResults(data.organizations || []);
      } else {
        setOrgSearchResults([]);
      }
    } catch {
      setOrgSearchResults([]);
    } finally {
      setOrgSearchLoading(false);
    }
  };

  const handleOrgSelect = (org: {_id: string; name: string; domain: string; industry: string}) => {
    setEmpData({
      ...empData,
      orgId: org._id,
      orgName: org.name,
      orgDomain: org.domain,
    });
    setOrgSearchResults([]);
  };

  const handleCreateNewOrg = () => {
    if (!empData.orgName) return;
    setEmpData({
      ...empData,
      orgId: "",
      orgDomain: empData.orgDomain || empData.orgName.toLowerCase().replace(/\s+/g, "") + ".com",
    });
    setOrgSearchResults([]);
  };

  const initPersonaChat = () => {
    setPersonaLoading(true);
    fetch(`${API_URL}/chatbot/persona-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        department: empData.department,
        role: empData.role,
        manager_name: empData.managerName,
        organization_name: empData.orgName,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        const initialMessage: PersonaMessage = {
          id: `msg_${Math.random().toString(36).substring(7)}`,
          role: "ai",
          content: data.message || getDefaultWelcomeMessage(),
        };
        setPersonaMessages([initialMessage]);
      })
      .catch(() => {
        const initialMessage: PersonaMessage = {
          id: `msg_${Math.random().toString(36).substring(7)}`,
          role: "ai",
          content: getDefaultWelcomeMessage(),
        };
        setPersonaMessages([initialMessage]);
      })
      .finally(() => {
        setPersonaLoading(false);
      });
  };

  const getDefaultWelcomeMessage = () => {
    const messages: Record<string, string> = {
      Engineering: `Welcome to ${empData.orgName || "your company"}! I see you're in Engineering as a ${empData.role || "team member"}. To help you work more effectively, I'd like to learn about your workflow. What's your preferred way to receive task updates and progress reports?`,
      Marketing: `Welcome to ${empData.orgName || "your company"}! I see you're in Marketing as a ${empData.role || "team member"}. Let's personalize your experience. How do you prefer to track campaign progress and receive updates on your projects?`,
      Sales: `Welcome to ${empData.orgName || "your company"}! I see you're in Sales as a ${empData.role || "team member"}. To help you close more deals, I'd like to understand your workflow. How do you prefer to receive leads and track your pipeline updates?`,
      Operations: `Welcome to ${empData.orgName || "your company"}! I see you're in Operations as a ${empData.role || "team member"}. Let's optimize your workflow. How do you prefer to receive task updates and coordinate with your team?`,
      Finance: `Welcome to ${empData.orgName || "your company"}! I see you're in Finance as a ${empData.role || "team member"}. To help you manage finances effectively, I'd like to learn about your preferences. How do you prefer to receive financial report updates and approval requests?`,
    };
    return messages[empData.department] || `Welcome to ${empData.orgName || "your company"}! I see you're in the ${empData.department || "your"} department as a ${empData.role || "team member"}. To personalize your AI assistant, tell me - how do you prefer to receive task updates and project notifications?`;
  };

  const sendPersonaMessage = async () => {
    if (!personaInput.trim()) return;
    
    const userMessage: PersonaMessage = {
      id: Date.now().toString(),
      role: "user",
      content: personaInput,
    };
    setPersonaMessages((prev) => [...prev, userMessage]);
    setPersonaInput("");
    setPersonaLoading(true);

    try {
      const res = await fetch(`${API_URL}/chatbot/persona-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...personaMessages, userMessage],
          context: {
            department: empData.department,
            role: empData.role,
            manager_name: empData.managerName,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const aiMessage: PersonaMessage = {
          id: Date.now().toString(),
          role: "ai",
          content: data.response || "Thank you for sharing that! Is there anything else about your work style or preferences you'd like to tell me?",
        };
        setPersonaMessages((prev) => [...prev, aiMessage]);
      } else {
        setPersonaMessages((prev) => [...prev, {
          id: Date.now().toString(),
          role: "ai",
          content: "Thanks for sharing! One more question - what's typically the biggest bottleneck or challenge you face in your daily workflow?",
        }]);
      }
    } catch {
      setPersonaMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: "ai",
        content: "Thanks for sharing! Can you tell me about your communication preferences - do you prefer detailed updates or quick summaries?",
      }]);
    } finally {
      setPersonaLoading(false);
    }
  };

  const saveEmployeePersona = async () => {
    setIsSaving(true);
    try {
      const userMessages = personaMessages
        .filter((m) => m.role === "user")
        .map((m) => m.content);
      
      await fetch(`${API_URL}/employees/persona`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email,
          organization_id: empData.orgId || undefined,
          department: empData.department,
          role: empData.role,
          manager_id: empData.managerId || undefined,
          subordinate_ids: empData.subordinates,
          preferences: userMessages,
          communication_style: userMessages[0] || "default",
          workflow_challenges: userMessages[1] || "",
          tools_preferred: userMessages[2] || "",
        }),
      });
    } catch {
    } finally {
      setIsSaving(false);
    }
  };

  const createWorkspaceNow = () => {
    if (empData.orgName) {
      setOrganization({
        id: empData.orgId || Math.random().toString(36).substring(2, 9),
        name: empData.orgName,
        domain: empData.orgDomain,
        industry: "",
        size: "",
        createdAt: new Date().toISOString(),
      });
    }
    saveEmployeePersona();
    router.push("/dashboard");
  };

  const createWorkspaceLater = () => {
    saveEmployeePersona();
    router.push("/");
  };

  useEffect(() => {
    if (step === "org-detect" && !empData.orgId && user?.email) {
      const runDetect = async () => {
        setLoading(true);
        try {
          const email = user.email || "";
          const domain = email.split("@")[1] || "";
          
          const res = await fetch(`${API_URL}/organizations/by-domain/${domain}`);
          if (res.ok) {
            const data = await res.json();
            if (data.organization) {
              setEmpData((prev) => ({
                ...prev,
                orgName: data.organization.name,
                orgDomain: data.organization.domain || domain,
                orgId: data.organization._id,
              }));
            } else {
              setEmpData((prev) => ({
                ...prev,
                orgName: "Acme Corporation",
                orgDomain: domain,
              }));
            }
          } else {
            setEmpData((prev) => ({
              ...prev,
              orgName: "Acme Corporation",
              orgDomain: domain,
            }));
          }
        } catch {
          setEmpData((prev) => ({
            ...prev,
            orgName: "Acme Corporation",
            orgDomain: "acme.com",
          }));
        } finally {
          setLoading(false);
        }
      };
      runDetect();
    }
  }, [step, user?.email]);

  useEffect(() => {
    if (step === "persona" && personaMessages.length === 0) {
      const timer = setTimeout(() => {
        initPersonaChat();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [step, personaMessages.length]);

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
              {user?.email || (user as any)?.phone}
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

        {step === "department" && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">
                What&apos;s your <span className="gradient-text">department?</span>
              </h1>
              <p className="text-text-muted">
                Select your department or let AI suggest based on your profile.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {aiSuggestions.map((dept, i) => (
                <button
                  key={i}
                  onClick={() => setEmpData({ ...empData, department: dept })}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
                    empData.department === dept
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-border-light"
                  }`}
                >
                  <span className="font-medium text-sm">{dept}</span>
                </button>
              ))}
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-background text-text-muted">or type your own</span>
              </div>
            </div>

            <input
              type="text"
              value={empData.department}
              onChange={(e) => setEmpData({ ...empData, department: e.target.value })}
              placeholder="e.g. Product Design, Data Science..."
              className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm mb-6"
            />

            <button
              onClick={() => setStep("org-detect")}
              disabled={!empData.department}
              className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {step === "org-detect" && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">
                Find your <span className="gradient-text">organization</span>
              </h1>
              <p className="text-text-muted">
                We&apos;ll try to auto-detect your organization from your email domain.
              </p>
            </div>

            <div className="glass rounded-xl p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="w-5 h-5 text-primary" />
                <span className="font-medium text-sm">AI Detection</span>
              </div>

              {!empData.orgName ? (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">
                    Based on your email domain, we found a potential match:
                  </p>
                  <button
                    onClick={handleDetectOrg}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Detect Organization
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{empData.orgName}</p>
                    <p className="text-sm text-text-muted">{empData.orgDomain}</p>
                  </div>
                  <CheckCircle className="w-6 h-6 text-emerald-400 ml-auto" />
                </div>
              )}
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-background text-text-muted">or search manually</span>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <input
                type="text"
                value={empData.orgName}
                onChange={(e) => {
                  setEmpData({ ...empData, orgName: e.target.value, orgId: "" });
                  searchOrganizations(e.target.value);
                }}
                placeholder="Search for your company..."
                className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
              />
              {orgSearchLoading && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-text-muted" />
              )}
            </div>

            {orgSearchResults.length > 0 && (
              <div className="mt-2 border border-border rounded-xl max-h-64 overflow-y-auto">
                {orgSearchResults.map((org) => (
                  <button
                    key={org._id}
                    onClick={() => handleOrgSelect(org)}
                    className="w-full px-4 py-3 text-left hover:bg-surface-light transition-colors flex items-center gap-3 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{org.name}</p>
                      <p className="text-xs text-text-muted">{org.domain}</p>
                    </div>
                    {org.industry && (
                      <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">
                        {org.industry}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {empData.orgName && orgSearchResults.length === 0 && !orgSearchLoading && (
              <div className="mt-3">
                <button
                  onClick={handleCreateNewOrg}
                  className="w-full py-2 text-sm text-primary hover:text-primary-light transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Create &quot;{empData.orgName}&quot; as new organization
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep("department")}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={() => setStep("manager")}
                disabled={!empData.orgName}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === "manager" && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">
                Who do you <span className="gradient-text">report to?</span>
              </h1>
              <p className="text-text-muted">
                This helps us build your organization hierarchy and route tasks correctly.
              </p>
            </div>

            <div className="space-y-5 mb-8">
              <div>
                <label className="block text-sm font-medium mb-2">Manager / Reporting To</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="text"
                    value={managerSearch}
                    onChange={(e) => searchManagers(e.target.value)}
                    placeholder="Search for your manager..."
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                  />
                </div>
                {managerResults.length > 0 && (
                  <div className="mt-2 border border-border rounded-xl max-h-48 overflow-y-auto">
                    {managerResults.map((emp) => (
                      <button
                        key={emp._id}
                        onClick={() => {
                          setEmpData({ ...empData, managerId: emp._id, managerName: emp.full_name });
                          setManagerSearch(emp.full_name);
                          setManagerResults([]);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-surface-light transition-colors flex items-center gap-3 cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-xs text-primary font-medium">
                            {emp.full_name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{emp.full_name}</p>
                          <p className="text-xs text-text-muted">{emp.role} - {emp.department}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {empData.managerId && (
                  <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-emerald-300">Selected: {empData.managerName}</span>
                    <button
                      onClick={() => setEmpData({ ...empData, managerId: "", managerName: "" })}
                      className="ml-auto cursor-pointer"
                    >
                      <X className="w-4 h-4 text-text-muted hover:text-foreground" />
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Your Role / Title</label>
                <input
                  type="text"
                  value={empData.role}
                  onChange={(e) => setEmpData({ ...empData, role: e.target.value })}
                  placeholder="e.g. Senior Developer, Marketing Manager..."
                  className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Direct Reports <span className="text-text-muted font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="text"
                    value={subordinateSearch}
                    onChange={(e) => searchSubordinates(e.target.value)}
                    placeholder="Search team members who report to you..."
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                  />
                </div>
                {subordinateResults.length > 0 && (
                  <div className="mt-2 border border-border rounded-xl max-h-48 overflow-y-auto">
                    {subordinateResults
                      .filter((emp) => !selectedSubordinates.find((s) => s._id === emp._id))
                      .map((emp) => (
                        <button
                          key={emp._id}
                          onClick={() => {
                            setSelectedSubordinates([...selectedSubordinates, emp]);
                            setSubordinateSearch("");
                            setSubordinateResults([]);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-surface-light transition-colors flex items-center gap-3 cursor-pointer"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-xs text-primary font-medium">
                              {emp.full_name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium">{emp.full_name}</p>
                            <p className="text-xs text-text-muted">{emp.role} - {emp.department}</p>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
                {selectedSubordinates.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {selectedSubordinates.map((emp) => (
                      <div
                        key={emp._id}
                        className="flex items-center gap-2 p-2 rounded-lg bg-surface border border-border"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-xs text-primary font-medium">
                            {emp.full_name.charAt(0)}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{emp.full_name}</p>
                          <p className="text-xs text-text-muted">{emp.role}</p>
                        </div>
                        <button
                          onClick={() =>
                            setSelectedSubordinates(selectedSubordinates.filter((s) => s._id !== emp._id))
                          }
                          className="cursor-pointer"
                        >
                          <X className="w-4 h-4 text-text-muted hover:text-foreground" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("org-detect")}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={() => {
                  setEmpData({ ...empData, subordinates: selectedSubordinates.map((s) => s._id) });
                  setStep("hierarchy");
                }}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === "hierarchy" && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">
                Your <span className="gradient-text">Team Structure</span>
              </h1>
              <p className="text-text-muted">
                Here&apos;s how you fit into the organization. This helps us route tasks correctly.
              </p>
            </div>

            <div className="glass rounded-2xl p-6 mb-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : true ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-bold text-xl">
                      {user?.email?.charAt(0).toUpperCase() || "U"}
                    </div>
                    <p className="mt-2 font-semibold">{user?.email?.split("@")[0] || "You"}</p>
                    <p className="text-sm text-text-muted">{empData.role || "Team Member"}</p>
                    <p className="text-xs text-primary">{empData.department} Department</p>
                  </div>

                  {empData.managerId && (
                    <>
                      <div className="flex justify-center">
                        <div className="w-px h-8 bg-border" />
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                          <Users className="w-6 h-6 text-primary" />
                        </div>
                        <p className="mt-2 text-sm font-medium">{empData.managerName}</p>
                        <p className="text-xs text-text-muted">Manager</p>
                      </div>
                    </>
                  )}

                  {selectedSubordinates.length > 0 && (
                    <>
                      <div className="flex justify-center">
                        <div className="w-px h-8 bg-border" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-text-muted mb-3">Direct Reports ({selectedSubordinates.length})</p>
                        <div className="flex flex-wrap justify-center gap-3">
                          {selectedSubordinates.map((sub) => (
                            <div
                              key={sub._id}
                              className="flex items-center gap-2 p-2 rounded-lg bg-surface border border-border"
                            >
                              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <span className="text-xs text-primary font-medium">
                                  {sub.full_name.charAt(0)}
                                </span>
                              </div>
                              <div>
                                <p className="text-xs font-medium">{sub.full_name}</p>
                                <p className="text-xs text-text-muted">{sub.role}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <GitBranch className="w-12 h-12 text-text-muted mx-auto mb-4" />
                  <p className="text-text-muted">No other team members found</p>
                  <p className="text-sm text-text-muted">You&apos;re the first in this organization!</p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("manager")}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={() => setStep("persona")}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === "persona" && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">
                Meet your <span className="gradient-text">AI Assistant</span>
              </h1>
              <p className="text-text-muted">
                Your AI assistant will learn your work style and preferences.
                Answer a few questions to personalize your experience.
              </p>
            </div>

            <div className="glass rounded-2xl overflow-hidden mb-6">
              <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
                {personaLoading && personaMessages.length === 0 && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="ml-2 text-text-muted">Loading your personalized questions...</span>
                  </div>
                )}
                {personaMessages.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role === "ai" ? (
                      <>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs text-white font-bold">AI</span>
                        </div>
                        <div className="glass-light rounded-lg px-4 py-2 text-sm max-w-md">
                          {msg.content}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-primary/20 rounded-lg px-4 py-2 text-sm max-w-md">
                          {msg.content}
                        </div>
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs text-primary font-bold">
                            {user?.email?.charAt(0).toUpperCase() || "U"}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {personaLoading && personaMessages.length > 0 && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-white font-bold">AI</span>
                    </div>
                    <div className="glass-light rounded-lg px-4 py-2 text-sm max-w-md flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-text-muted">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border p-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={personaInput}
                    onChange={(e) => setPersonaInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !personaLoading && sendPersonaMessage()}
                    placeholder="Type your response..."
                    disabled={personaLoading}
                    className="flex-1 px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm disabled:opacity-50"
                  />
                  <button
                    onClick={sendPersonaMessage}
                    disabled={personaLoading || !personaInput.trim()}
                    className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {personaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send"}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("hierarchy")}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={() => setStep("complete")}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2"
              >
                Complete Setup
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="max-w-xl mx-auto text-center">
            <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-8 animate-float">
              <CheckCircle className="w-12 h-12 text-emerald-400" />
            </div>

            <h1 className="text-4xl font-bold mb-4">
              Welcome to <span className="gradient-text">{empData.orgName}</span>
            </h1>
            <p className="text-text-muted text-lg mb-12">
              Your workspace is ready. You&apos;re set up as{" "}
              {empData.role || "team member"} in the {empData.department || "your"} department.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              {[
                { label: "Department", value: empData.department || "—" },
                { label: "Manager", value: empData.managerName || "Not set" },
                { label: "Organization", value: empData.orgName || "—" },
                { label: "AI Assistant", value: "Active" },
              ].map((stat, i) => (
                <div key={i} className="glass rounded-xl p-6">
                  <div className="text-lg font-bold text-primary">{stat.value}</div>
                  <div className="text-sm text-text-muted mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="glass rounded-xl p-6 mb-8 text-left">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Your AI Assistant knows:
              </h3>
              <ul className="space-y-2 text-sm text-text-muted">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Your communication preferences
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Workflow challenges and bottlenecks
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Team structure and reporting lines
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Department and role context
                </li>
              </ul>
            </div>

            <div className="text-left mb-6">
              <p className="text-lg font-medium mb-4">How would you like to proceed?</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={createWorkspaceNow}
                  disabled={isSaving}
                  className="p-6 rounded-xl border-2 border-primary bg-primary/10 hover:bg-primary/20 transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                      <ArrowRight className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-semibold">Create Workspace Now</span>
                  </div>
                  <p className="text-sm text-text-muted">
                    Go directly to your dashboard with tasks, notifications, and reporting views
                  </p>
                </button>

                <button
                  onClick={createWorkspaceLater}
                  disabled={isSaving}
                  className="p-6 rounded-xl border-2 border-border hover:border-border-light transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-text-muted" />
                    </div>
                    <span className="font-semibold">Create Later</span>
                  </div>
                  <p className="text-sm text-text-muted">
                    Save your AI intelligence and setup details for later
                  </p>
                </button>
              </div>
            </div>

            {isSaving && (
              <div className="flex items-center justify-center gap-2 text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Saving your preferences...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
