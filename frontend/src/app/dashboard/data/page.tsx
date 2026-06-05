"use client";

import { useOrganizationStore } from "@/stores/organizationStore";
import DashboardLayout from "@/components/DashboardLayout";
import { SuggestedDocumentsCard } from "@/components/owners/SuggestedDocumentsCard";
import { YourFilesCard } from "@/components/owners/YourFilesCard";

export default function UploadedDataPage() {
  const { organization } = useOrganizationStore();

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            Uploaded Data
          </h1>
          <p className="text-text-muted mt-1">
            Get suggestions for files that drive better AI insights, then upload and manage everything in one place.
          </p>
        </div>

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
      </div>
    </DashboardLayout>
  );
}
