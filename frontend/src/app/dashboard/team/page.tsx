"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrganizationStore } from "@/stores/organizationStore";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui";
import { Users, Search, Loader2, ArrowLeft } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string;
  phone?: string;
}

export default function TeamPage() {
  const router = useRouter();
  const { organization } = useOrganizationStore();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        const params = new URLSearchParams();
        if (organization?.id) params.set("org_id", organization.id);
        const query = params.toString() ? `?${params.toString()}` : "";
        const res = await fetch(`${API_URL}/employees${query}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setMembers((data.employees || []).map((e: any) => ({ ...e, id: e._id || e.id })));
      } catch {
        setMembers([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTeam();
  }, [organization?.id]);

  const filtered = members.filter((m) =>
    m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.department?.toLowerCase().includes(search.toLowerCase()) ||
    m.role?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard/notifications")} className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Team</h1>
              <p className="text-sm text-text-muted mt-1">{members.length} team members</p>
            </div>
          </div>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search team members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border text-sm focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-text-muted">
                <Users className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">{search ? "No matching members" : "No team members yet"}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filtered.map((member) => (
                  <div key={member.id} className="flex items-center gap-4 px-4 py-4 hover:bg-surface-light transition-colors">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary">
                        {member.full_name?.charAt(0) || "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{member.full_name || "Unknown"}</p>
                      <p className="text-xs text-text-muted">{member.role || member.email}</p>
                    </div>
                    <div className="hidden sm:block text-sm text-text-muted">{member.department || "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
