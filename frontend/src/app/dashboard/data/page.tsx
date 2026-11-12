"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import DashboardLayout from "@/components/DashboardLayout";
import { SuggestedDocumentsCard } from "@/components/owners/SuggestedDocumentsCard";
import { YourFilesCard } from "@/components/owners/YourFilesCard";
import UnderstandingView from "@/components/owners/UnderstandingView";
import { cn } from "@/lib/utils";

type Option = "uploaded" | "understanding";

const OPTIONS: [Option, string][] = [
  ["uploaded", "Uploaded data"],
  ["understanding", "What YesBoss understands"],
];

export default function MyDataPage() {
  const { role } = useAuth();
  const { organization } = useOrganizationStore();
  const [option, setOption] = useState<Option>("uploaded");
  // only owners get the second option; the server refuses everyone else too
  const isOwner = role === "owner";

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            {isOwner ? "My Data" : "Uploaded Data"}
          </h1>
          <p className="text-text-muted mt-1">
            {isOwner && option === "understanding"
              ? "Read it, check it, and tell YesBoss what is wrong."
              : "Get suggestions for files that drive better AI insights, then upload and manage everything in one place."}
          </p>
        </div>

        {isOwner && (
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="My data">
            {OPTIONS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={option === key}
                onClick={() => setOption(key)}
                className={cn(
                  "rounded-full border-2 border-outline px-5 py-2 text-sm font-bold shadow-[3px_3px_0_var(--shadow-hard)] transition-all cursor-pointer hover:-translate-x-px hover:-translate-y-px",
                  option === key ? "bg-highlight text-on-highlight" : "bg-surface text-foreground hover:bg-surface-light"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {isOwner && option === "understanding" ? (
          <UnderstandingView />
        ) : (
          <>
            <SuggestedDocumentsCard
              orgMeta={{
                organizationName: organization?.name || "",
                industry: organization?.industry || "",
                microVertical: organization?.micro_vertical || "",
                size: organization?.size || "",
                domain: organization?.domain || "",
              }}
            />

            <YourFilesCard />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
