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
} from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type EmployeeStep = "department" | "org-detect" | "manager" | "persona";

interface Employee {
  _id: string;
  full_name: string;
  email: string;
  role: string;
  department: string;
  manager_id?: string;
  manager_email?: string;
}

export default function EmployeeOnboarding() {
  const { user, signOut } = useAuth();
  const { setOrganization } = useOrganizationStore();
  const router = useRouter();
  const [step, setStep] = useState<EmployeeStep>("org-detect");
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
  const [managerAutoFetched, setManagerAutoFetched] = useState(false);
  const [allOrgMembers, setAllOrgMembers] = useState<Employee[]>([]);
  const [subordinateSearch, setSubordinateSearch] = useState("");
  const [subordinateResults, setSubordinateResults] = useState<Employee[]>([]);
  const [roleSuggestions, setRoleSuggestions] = useState<string[]>([]);
  const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);
  const [selectedSubordinates, setSelectedSubordinates] = useState<Employee[]>([]);
  const [orgSearchResults, setOrgSearchResults] = useState<{_id: string; name: string; domain: string; industry: string}[]>([]);
  const [orgSearchLoading, setOrgSearchLoading] = useState(false);
  interface PersonaQuestion {
    question: string;
    options: string[];
    time_estimate: number;
    need_more_time: boolean;
    question_number: number;
  }
  const [currentQuestion, setCurrentQuestion] = useState<PersonaQuestion | null>(null);
  const [personaLoading, setPersonaLoading] = useState(false);
  const [personaAnswers, setPersonaAnswers] = useState<{question: string; answer: string}[]>([]);
  const [customAnswer, setCustomAnswer] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showMoreTime, setShowMoreTime] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const steps = [
    { id: "org-detect", label: "Organization", icon: Building2 },
    { id: "department", label: "Department", icon: User },
    { id: "manager", label: "Reporting", icon: Users },
    { id: "persona", label: "AI Persona", icon: MessageSquare },
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
    if (query.length < 1) {
      // Show all org members when query is empty
      if (allOrgMembers.length > 0) {
        setManagerResults(allOrgMembers);
      } else {
        setManagerResults([]);
      }
      return;
    }
    try {
      const res = await fetch(`${API_URL}/org-chart/members/search?q=${encodeURIComponent(query)}&organization_id=${empData.orgId}`);
      if (res.ok) {
        const data = await res.json();
        setManagerResults(data.members || []);
      }
    } catch {
      setManagerResults([]);
    }
  };

  const fetchRoleSuggestions = async (query: string) => {
    if (query.length < 1) {
      setRoleSuggestions([]);
      setShowRoleSuggestions(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/org-chart/role-suggestions?q=${encodeURIComponent(query)}&organization_id=${empData.orgId}`);
      if (res.ok) {
        const data = await res.json();
        setRoleSuggestions(data.suggestions || []);
        setShowRoleSuggestions(data.suggestions?.length > 0);
      }
    } catch {
      setRoleSuggestions([]);
    }
  };

  const searchSubordinates = async (query: string) => {
    setSubordinateSearch(query);
    if (query.length < 2) {
      setSubordinateResults([]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/org-chart/members/search?q=${encodeURIComponent(query)}&organization_id=${empData.orgId}`);
      if (res.ok) {
        const data = await res.json();
        setSubordinateResults(data.members || []);
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
          fetchOrgChartData(data.organization._id);
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
    setEmpData((prev) => ({
      ...prev,
      orgId: org._id,
      orgName: org.name,
      orgDomain: org.domain,
    }));
    setOrgSearchResults([]);
    fetchOrgChartData(org._id);
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

  const fetchOrgChartData = async (orgId: string) => {
    if (!user?.email || !orgId) return;
    try {
      const res = await fetch(`${API_URL}/org-chart/members?organization_id=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        const members: (Employee & { manager_email?: string })[] = data.members || [];
        const currentMember = members.find(
          (m) => m.email?.toLowerCase() === user.email?.toLowerCase()
        );
        if (!currentMember) return;

        const updates: Partial<typeof empData> = {};

        if (currentMember.department) {
          updates.department = currentMember.department;
        }

        const memberRole = currentMember.role || (currentMember as any).title;
        if (memberRole && typeof memberRole === "string") {
          updates.role = memberRole;
          fetch(`${API_URL}/org-chart/role-register?role=${encodeURIComponent(memberRole)}`, { method: "POST" }).catch(() => {});
        }

        if (currentMember.manager_email) {
          const managerMember = members.find(
            (m) => m.email?.toLowerCase() === currentMember.manager_email?.toLowerCase()
          );
          if (managerMember) {
            updates.managerId = managerMember._id;
            updates.managerName = managerMember.full_name;
            setManagerSearch(managerMember.full_name);
            setManagerResults([]);
          }
        }

        const directReports = members.filter(
          (m) => m.email?.toLowerCase() !== user.email?.toLowerCase() &&
            m.manager_email?.toLowerCase() === user.email?.toLowerCase()
        );
        if (directReports.length > 0) {
          updates.subordinates = directReports.map((m) => m._id);
          setSelectedSubordinates(directReports);
        }

        setEmpData((prev) => ({ ...prev, ...updates }));
      }
    } catch {
    }
  };

  const goToDashboard = async () => {
    if (isRedirecting) return;
    setIsRedirecting(true);
    await saveEmployeePersona();
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
    router.push("/dashboard");
  };

  const generateNextQuestion = async (answers: {question: string; answer: string}[]) => {
    setPersonaLoading(true);
    try {
      const res = await fetch(`${API_URL}/chatbot/employee-persona/generate-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: empData.department,
          role: empData.role,
          manager_name: empData.managerName,
          organization_name: empData.orgName,
          previous_answers: answers,
          question_count: answers.length,
          more_time_agreed: false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.question) {
          setCurrentQuestion(data);
          setShowCustomInput(false);
          setCustomAnswer("");
        }
      }
    } catch {
    } finally {
      setPersonaLoading(false);
    }
  };

  const handlePersonaAnswer = async (answer: string) => {
    const answeredQuestion = currentQuestion;
    const updatedAnswers = [...personaAnswers, { question: answeredQuestion?.question || "", answer }];
    setPersonaAnswers(updatedAnswers);
    setCurrentQuestion(null);

    if (answeredQuestion?.need_more_time && !showMoreTime) {
      setShowMoreTime(true);
    } else {
      await generateNextQuestion(updatedAnswers);
    }
  };

  const handleMoreTimeContinue = async () => {
    setShowMoreTime(false);
    setPersonaLoading(true);
    try {
      const res = await fetch(`${API_URL}/chatbot/employee-persona/generate-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: empData.department,
          role: empData.role,
          manager_name: empData.managerName,
          organization_name: empData.orgName,
          previous_answers: personaAnswers,
          question_count: personaAnswers.length,
          more_time_agreed: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.question) {
          setCurrentQuestion(data);
          setShowCustomInput(false);
          setCustomAnswer("");
        }
      }
    } catch {
    } finally {
      setPersonaLoading(false);
    }
  };

  const handleMoreTimeSkip = async () => {
    setShowMoreTime(false);
    await goToDashboard();
  };

  const saveEmployeePersona = async () => {
    try {
      const userMessages = personaAnswers.map((a) => a.answer);
      
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

      // Register custom role if user entered one not in the common list
      if (empData.role) {
        fetch(`${API_URL}/org-chart/role-register?role=${encodeURIComponent(empData.role)}`, {
          method: "POST",
        }).catch(() => {});
      }
    } catch {
    }
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
              fetchOrgChartData(data.organization._id);
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
    if (step === "manager" && empData.orgId && !managerAutoFetched) {
      const fetchAllMembers = async () => {
        try {
          const res = await fetch(`${API_URL}/org-chart/members?organization_id=${empData.orgId}`);
          if (res.ok) {
            const data = await res.json();
            const members = data.members || [];
            setAllOrgMembers(members);
            setManagerResults(members);
            setManagerAutoFetched(true);
          }
        } catch {}
      };
      fetchAllMembers();
    }
  }, [step, empData.orgId, managerAutoFetched]);

  useEffect(() => {
    if (step === "persona" && personaAnswers.length === 0 && !currentQuestion && !personaLoading) {
      generateNextQuestion([]);
    }
  }, [step]);

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
              <div className="mt-1">
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep("department")}
                disabled={!empData.orgName}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === "department" && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">
                What&apos;s your <span className="gradient-text">department?</span>
              </h1>

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

            <div className="flex gap-3">
              <button
                onClick={() => setStep("org-detect")}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={() => setStep("manager")}
                disabled={!empData.department}
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
                    onFocus={() => searchManagers(managerSearch)}
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
                <div className="relative">
                  <input
                    type="text"
                    value={empData.role}
                    onChange={(e) => {
                      setEmpData({ ...empData, role: e.target.value });
                      fetchRoleSuggestions(e.target.value);
                    }}
                    onFocus={() => fetchRoleSuggestions(empData.role)}
                    onBlur={() => {
                      setTimeout(() => setShowRoleSuggestions(false), 200);
                      if (empData.role) {
                        fetch(`${API_URL}/org-chart/role-register?role=${encodeURIComponent(empData.role)}`, { method: "POST" }).catch(() => {});
                      }
                    }}
                    placeholder="e.g. Senior Developer, Marketing Manager..."
                    className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none transition-colors text-sm"
                  />
                  {showRoleSuggestions && roleSuggestions.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full border border-border rounded-xl max-h-48 overflow-y-auto bg-background shadow-lg">
                      {roleSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setEmpData({ ...empData, role: suggestion });
                            setShowRoleSuggestions(false);
                            setRoleSuggestions([]);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-surface-light transition-colors text-sm cursor-pointer"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                onClick={() => setStep("department")}
                className="flex-1 py-4 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={() => {
                  setEmpData({ ...empData, subordinates: selectedSubordinates.map((s) => s._id) });
                  setStep("persona");
                }}
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
                {personaAnswers.length === 0 && personaLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="ml-2 text-text-muted">Getting to know you...</span>
                  </div>
                )}

                {personaAnswers.map((qa, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-end">
                      <div className="bg-primary/20 rounded-lg px-4 py-2 text-sm max-w-md">
                        {qa.answer}
                      </div>
                    </div>
                  </div>
                ))}

                {showMoreTime && (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Want to share more?</h3>
                    <p className="text-sm text-text-muted mb-6 max-w-sm mx-auto">
                      We&apos;ve learned a lot so far! Would you like to answer a few more questions to help your AI assistant understand you even better?
                    </p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={handleMoreTimeSkip}
                        disabled={isRedirecting}
                        className="px-6 py-3 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer"
                      >
                        No, I&apos;m good
                      </button>
                      <button
                        onClick={handleMoreTimeContinue}
                        disabled={personaLoading}
                        className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer flex items-center gap-2"
                      >
                        {personaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Yes, let&apos;s continue
                      </button>
                    </div>
                  </div>
                )}

                {currentQuestion && !showMoreTime && (
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-white font-bold">AI</span>
                      </div>
                      <div className="flex-1">
                        <div className="glass-light rounded-lg px-4 py-3 text-sm mb-3">
                          <div className="text-xs text-primary font-medium mb-1">
                            Question {currentQuestion.question_number}
                          </div>
                          {currentQuestion.question}
                        </div>
                        <div className="space-y-2">
                          {currentQuestion.options.map((opt, idx) => (
                            <button
                              key={idx}
                              onClick={() => handlePersonaAnswer(opt)}
                              disabled={personaLoading}
                              className="w-full text-left px-4 py-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all text-sm cursor-pointer disabled:opacity-50"
                            >
                              {opt}
                            </button>
                          ))}
                          {!showCustomInput ? (
                            <button
                              onClick={() => setShowCustomInput(true)}
                              className="w-full text-center px-4 py-2 text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
                            >
                              Or write your own answer...
                            </button>
                          ) : (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={customAnswer}
                                onChange={(e) => setCustomAnswer(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && customAnswer.trim() && handlePersonaAnswer(customAnswer)}
                                placeholder="Type your answer..."
                                disabled={personaLoading}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                              />
                              <button
                                onClick={() => customAnswer.trim() && handlePersonaAnswer(customAnswer)}
                                disabled={personaLoading || !customAnswer.trim()}
                                className="px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all cursor-pointer disabled:opacity-50"
                              >
                                Send
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {personaLoading && currentQuestion && !showMoreTime && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-white font-bold">AI</span>
                    </div>
                    <div className="glass-light rounded-lg px-4 py-2 text-sm flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-text-muted">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>
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
                onClick={goToDashboard}
                disabled={isRedirecting}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer hover:shadow-lg hover:shadow-accent/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isRedirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Complete Setup
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
